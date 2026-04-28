use std::path::PathBuf;
use std::sync::Mutex;

use anyhow::{anyhow, Context, Result};
use serde::Serialize;
use tauri::{AppHandle, Manager, RunEvent, State};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tokio::sync::oneshot;

#[derive(Default)]
struct SidecarState(Mutex<Option<SidecarHandle>>);

struct SidecarHandle {
    child: CommandChild,
    info: ServerInfo,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ServerInfo {
    url: String,
    data_dir: String,
}

#[tauri::command]
fn get_server_info(state: State<'_, SidecarState>) -> Result<ServerInfo, String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    guard
        .as_ref()
        .map(|h| h.info.clone())
        .ok_or_else(|| "sidecar not started".to_string())
}

fn resolve_data_dir() -> Result<PathBuf> {
    let base = dirs::data_dir().ok_or_else(|| anyhow!("cannot resolve data dir"))?;
    let dir = base.join("NovelLocalStudio");
    std::fs::create_dir_all(&dir).context("create data dir")?;
    Ok(dir)
}

fn resolve_sidecar_script(app: &AppHandle) -> Result<PathBuf> {
    if let Ok(env_path) = std::env::var("NLS_SIDECAR_SCRIPT") {
        return Ok(PathBuf::from(env_path));
    }
    let resolver = app.path();
    if let Ok(p) = resolver.resolve(
        "resources/mastra/server.cjs",
        tauri::path::BaseDirectory::Resource,
    ) {
        if p.exists() {
            return Ok(p);
        }
    }
    let cwd = std::env::current_dir().context("cwd")?;
    let candidates = [
        cwd.join("../mastra/dist/server.cjs"),
        cwd.join("../../mastra/dist/server.cjs"),
        cwd.join("mastra/dist/server.cjs"),
    ];
    for c in candidates {
        if c.exists() {
            return Ok(c);
        }
    }
    Err(anyhow!(
        "cannot find mastra sidecar script. Set NLS_SIDECAR_SCRIPT or build mastra package."
    ))
}

async fn spawn_sidecar(app: AppHandle) -> Result<SidecarHandle> {
    let port = portpicker::pick_unused_port().ok_or_else(|| anyhow!("no free port"))?;
    let data_dir = resolve_data_dir()?;
    let script = resolve_sidecar_script(&app)?;

    log::info!(
        "spawning sidecar: binaries/node {} --port {} --data-dir {}",
        script.display(),
        port,
        data_dir.display()
    );

    let sidecar = app
        .shell()
        .sidecar("node")
        .context("sidecar(node)")?
        .args([
            script.to_string_lossy().to_string(),
            "--port".into(),
            port.to_string(),
            "--data-dir".into(),
            data_dir.to_string_lossy().to_string(),
        ]);

    let (mut rx, child) = sidecar.spawn().context("spawn sidecar")?;

    let (ready_tx, ready_rx) = oneshot::channel::<u16>();
    let mut ready_tx = Some(ready_tx);

    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => {
                    let line = String::from_utf8_lossy(&bytes).trim().to_string();
                    log::info!("[sidecar:out] {line}");
                    if let Some(rest) = line.strip_prefix("READY:") {
                        if let Ok(p) = rest.trim().parse::<u16>() {
                            if let Some(tx) = ready_tx.take() {
                                let _ = tx.send(p);
                            }
                        }
                    }
                }
                CommandEvent::Stderr(bytes) => {
                    let line = String::from_utf8_lossy(&bytes).trim().to_string();
                    log::warn!("[sidecar:err] {line}");
                }
                CommandEvent::Terminated(payload) => {
                    log::warn!("[sidecar] terminated: {:?}", payload);
                    break;
                }
                CommandEvent::Error(err) => {
                    log::error!("[sidecar] error: {err}");
                }
                _ => {}
            }
        }
    });

    let ready_port = tokio::time::timeout(std::time::Duration::from_secs(30), ready_rx)
        .await
        .map_err(|_| anyhow!("sidecar READY timeout (30s)"))?
        .map_err(|_| anyhow!("sidecar exited before READY"))?;

    let info = ServerInfo {
        url: format!("http://127.0.0.1:{ready_port}"),
        data_dir: data_dir.to_string_lossy().into_owned(),
    };

    Ok(SidecarHandle { child, info })
}

pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(SidecarState::default())
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                match spawn_sidecar(handle.clone()).await {
                    Ok(sidecar) => {
                        log::info!("sidecar ready: {}", sidecar.info.url);
                        let state: State<SidecarState> = handle.state();
                        let mut guard = match state.0.lock() {
                            Ok(g) => g,
                            Err(_) => return,
                        };
                        *guard = Some(sidecar);
                    }
                    Err(e) => log::error!("sidecar failed: {e:?}"),
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_server_info])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let RunEvent::ExitRequested { .. } = event {
                let state: State<SidecarState> = app.state();
                let mut guard = match state.0.lock() {
                    Ok(g) => g,
                    Err(_) => return,
                };
                if let Some(sidecar) = guard.take() {
                    log::info!("killing sidecar...");
                    let _ = sidecar.child.kill();
                }
            }
        });
}
