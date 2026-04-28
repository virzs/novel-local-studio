#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use axum::{
    body::Body,
    extract::State,
    http::{header, HeaderValue, Method, StatusCode, Uri},
    response::{Html, IntoResponse, Response},
    routing::{any, get, post},
    Json, Router,
};
use include_dir::{include_dir, Dir};
use once_cell::sync::Lazy;
use serde::Serialize;
use serde_json::json;
use tauri::{async_runtime::spawn, Manager};
#[cfg(not(debug_assertions))]
use tauri_plugin_shell::ShellExt;
#[cfg(not(debug_assertions))]
use tauri_plugin_shell::process::CommandEvent;
use tokio::time::{sleep, Duration};
use tower_http::cors::{Any, CorsLayer};

static WEB_DIST: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/../dist");

const APP_NAME: &str = "Novel Local Studio";
const APP_VERSION: &str = "0.1.0";
const SERVER_ADDR: &str = "127.0.0.1:4311";
const DEFAULT_MASTRA_PORT: u16 = 4312;

static BOOTSTRAP: Lazy<Arc<Mutex<BootstrapState>>> =
    Lazy::new(|| Arc::new(Mutex::new(BootstrapState::new())));

#[derive(Clone)]
struct AppState {
    api_base: String,
    mastra_base: String,
    bootstrap: Arc<Mutex<BootstrapState>>,
}

#[derive(Clone, Serialize)]
struct BootstrapLogEntry {
    time: String,
    level: &'static str,
    message: String,
}

#[derive(Clone, Serialize)]
struct BootstrapState {
    ready: bool,
    phase: &'static str,
    logs: Vec<BootstrapLogEntry>,
    error: Option<String>,
}

impl BootstrapState {
    fn new() -> Self {
        Self {
            ready: false,
            phase: "starting",
            logs: Vec::new(),
            error: None,
        }
    }
}

#[derive(Serialize)]
struct ShellInfo {
    app_name: &'static str,
    shell_mode: &'static str,
    web_access: bool,
    version: &'static str,
}

#[derive(Serialize)]
struct MastraInfo {
    enabled: bool,
    base_url: String,
    gateway_url: String,
    reachable: bool,
}

fn create_router(api_base: String, mastra_base: String) -> Router {
    let state = AppState {
        api_base,
        mastra_base,
        bootstrap: BOOTSTRAP.clone(),
    };

    Router::new()
        .route("/health", get(health))
        .route("/api/bootstrap", get(bootstrap_state))
        .route("/api/shell", get(shell))
        .route("/api/mastra", get(mastra_info))
        .route("/api/projects", any(proxy_to_mastra))
        .route("/api/projects/{id}", any(proxy_to_mastra))
        .route("/api/projects/{id}/chapters", any(proxy_to_mastra))
        .route("/api/chapters/{id}", any(proxy_to_mastra))
        .route("/api/agents/{agent_id}/generate", post(proxy_agent_generate))
        .route("/api/agents-config", any(proxy_to_mastra))
        .route("/api/agents-config/{id}", any(proxy_to_mastra))
        .route("/api/settings", any(proxy_to_mastra))
        .route("/api/settings/{key}", any(proxy_to_mastra))
        .fallback(static_assets)
        .with_state(state)
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE, Method::OPTIONS])
                .allow_headers(Any),
        )
}

async fn health(State(state): State<AppState>) -> impl IntoResponse {
    let bootstrap = read_bootstrap(&state.bootstrap);

    Json(json!({
        "status": if bootstrap.ready { "ok" } else { "starting" },
        "service": "novel-local-studio",
        "mode": if cfg!(debug_assertions) { "development" } else { "desktop" },
        "apiBase": state.api_base,
        "mastraBase": state.mastra_base,
        "ready": bootstrap.ready,
        "error": bootstrap.error,
        "timestamp": chrono_like_timestamp(),
    }))
}

async fn bootstrap_state(State(state): State<AppState>) -> impl IntoResponse {
    Json(read_bootstrap(&state.bootstrap))
}

async fn shell() -> impl IntoResponse {
    Json(ShellInfo {
        app_name: APP_NAME,
        shell_mode: "tauri-wrapper",
        web_access: true,
        version: APP_VERSION,
    })
}

async fn mastra_info(State(state): State<AppState>) -> impl IntoResponse {
    let reachable = reqwest::get(format!("{}/health", state.mastra_base))
        .await
        .map(|response| response.status().is_success())
        .unwrap_or(false);

    Json(MastraInfo {
        enabled: true,
        base_url: state.mastra_base.clone(),
        gateway_url: format!("{}/api/agents", state.api_base),
        reachable,
    })
}

async fn proxy_to_mastra(
    State(state): State<AppState>,
    uri: Uri,
    req: axum::extract::Request,
) -> impl IntoResponse {
    let path_and_query = uri.path_and_query().map(|pq| pq.as_str()).unwrap_or("/");
    let url = format!("{}{}", state.mastra_base, path_and_query);
    let method = req.method().clone();

    let body_bytes = match axum::body::to_bytes(req.into_body(), usize::MAX).await {
        Ok(bytes) => bytes,
        Err(_) => {
            return (StatusCode::BAD_REQUEST, Json(json!({ "error": "Failed to read request body" }))).into_response();
        }
    };

    let client = reqwest::Client::new();
    let mut upstream_req = client.request(
        reqwest::Method::from_bytes(method.as_str().as_bytes()).unwrap_or(reqwest::Method::GET),
        &url,
    );

    if !body_bytes.is_empty() {
        upstream_req = upstream_req
            .header("Content-Type", "application/json")
            .body(body_bytes.to_vec());
    }

    match upstream_req.send().await {
        Ok(response) => {
            let status = response.status();
            match response.json::<serde_json::Value>().await {
                Ok(body) => (StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::OK), Json(body)).into_response(),
                Err(err) => (
                    StatusCode::BAD_GATEWAY,
                    Json(json!({ "error": format!("Failed to parse Mastra response: {}", err) })),
                ).into_response(),
            }
        }
        Err(err) => (
            StatusCode::BAD_GATEWAY,
            Json(json!({ "error": format!("Mastra unreachable: {}", err) })),
        ).into_response(),
    }
}

async fn proxy_agent_generate(
    State(state): State<AppState>,
    axum::extract::Path(agent_id): axum::extract::Path<String>,
    Json(payload): Json<serde_json::Value>,
) -> impl IntoResponse {
    let url = format!("{}/api/agents/{}/generate", state.mastra_base, agent_id);

    let client = reqwest::Client::new();
    match client.post(&url).json(&payload).send().await {
        Ok(response) => {
            let status = response.status();
            match response.json::<serde_json::Value>().await {
                Ok(body) => (StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::OK), Json(body)).into_response(),
                Err(err) => (
                    StatusCode::BAD_GATEWAY,
                    Json(json!({ "error": format!("Failed to parse Mastra response: {}", err) })),
                )
                    .into_response(),
            }
        }
        Err(err) => (
            StatusCode::BAD_GATEWAY,
            Json(json!({ "error": format!("Mastra agent server unreachable: {}", err) })),
        )
            .into_response(),
    }
}

async fn static_assets(uri: Uri) -> Response {
    let path = sanitize_path(uri.path());
    let asset_path = if path.is_empty() { "index.html" } else { path.as_str() };

    if let Some(file) = WEB_DIST.get_file(asset_path) {
        let mime = mime_for_path(asset_path);
        return Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, mime)
            .body(Body::from(file.contents().to_vec()))
            .unwrap();
    }

    if let Some(index) = WEB_DIST.get_file("index.html") {
        return Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, HeaderValue::from_static("text/html; charset=utf-8"))
            .body(Body::from(index.contents().to_vec()))
            .unwrap();
    }

    if path.is_empty() {
        return Json(json!({
            "service": "novel-local-studio",
            "mode": if cfg!(debug_assertions) { "development" } else { "desktop" },
            "message": "Frontend dist not found. In dev mode, open http://127.0.0.1:1420/."
        }))
        .into_response();
    }

    (StatusCode::NOT_FOUND, Html("dist not found".to_string())).into_response()
}

fn sanitize_path(path: &str) -> String {
    path.trim_start_matches('/')
        .split('?')
        .next()
        .unwrap_or_default()
        .to_string()
}

fn mime_for_path(path: &str) -> HeaderValue {
    let value = if path.ends_with(".js") {
        "application/javascript; charset=utf-8"
    } else if path.ends_with(".css") {
        "text/css; charset=utf-8"
    } else if path.ends_with(".json") {
        "application/json; charset=utf-8"
    } else if path.ends_with(".svg") {
        "image/svg+xml"
    } else if path.ends_with(".png") {
        "image/png"
    } else if path.ends_with(".ico") {
        "image/x-icon"
    } else {
        "text/html; charset=utf-8"
    };

    HeaderValue::from_static(value)
}

fn chrono_like_timestamp() -> String {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default();

    format!("{}", seconds)
}

fn read_bootstrap(bootstrap: &Arc<Mutex<BootstrapState>>) -> BootstrapState {
    bootstrap.lock().unwrap().clone()
}

fn push_bootstrap_log(bootstrap: &Arc<Mutex<BootstrapState>>, phase: &'static str, message: &str) {
    let mut state = bootstrap.lock().unwrap();
    state.phase = phase;
    state.logs.push(BootstrapLogEntry {
        time: chrono_like_timestamp(),
        level: "info",
        message: message.to_string(),
    });

    if state.logs.len() > 200 {
        let overflow = state.logs.len() - 200;
        state.logs.drain(0..overflow);
    }
}

fn set_bootstrap_error(bootstrap: &Arc<Mutex<BootstrapState>>, phase: &'static str, message: &str) {
    let mut state = bootstrap.lock().unwrap();
    state.phase = phase;
    state.error = Some(message.to_string());
    state.logs.push(BootstrapLogEntry {
        time: chrono_like_timestamp(),
        level: "error",
        message: message.to_string(),
    });

    if state.logs.len() > 200 {
        let overflow = state.logs.len() - 200;
        state.logs.drain(0..overflow);
    }
}

async fn run_bootstrap_sequence(bootstrap: Arc<Mutex<BootstrapState>>, mastra_base: String, api_base: String) {
    push_bootstrap_log(&bootstrap, "starting", "Initializing local API service");
    sleep(Duration::from_millis(120)).await;
    push_bootstrap_log(&bootstrap, "checking-mastra", &format!("Mastra agent server: {}", mastra_base));
    sleep(Duration::from_millis(160)).await;
    push_bootstrap_log(&bootstrap, "readying-routes", "Registering shell, Mastra, project and agent routes");
    sleep(Duration::from_millis(160)).await;
    push_bootstrap_log(&bootstrap, "ready", &format!("Local desktop API is ready at {}", api_base));

    let mut state = bootstrap.lock().unwrap();
    state.ready = true;
}

async fn can_reuse_existing_server(api_base: &str) -> bool {
    let Ok(response) = reqwest::get(format!("{}/health", api_base)).await else {
        return false;
    };

    if !response.status().is_success() {
        return false;
    }

    let payload: serde_json::Value = match response.json().await {
        Ok(payload) => payload,
        Err(_) => return false,
    };

    payload
        .get("service")
        .and_then(|value| value.as_str())
        .map(|value| value == "novel-local-studio")
        .unwrap_or(false)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let api_base = format!("http://{}", SERVER_ADDR);
            let mastra_port = std::env::var("MASTRA_PORT")
                .ok()
                .and_then(|p| p.parse::<u16>().ok())
                .unwrap_or(DEFAULT_MASTRA_PORT);
            let mastra_base = format!("http://127.0.0.1:{}", mastra_port);
            let bootstrap = BOOTSTRAP.clone();

            if let Ok(data_dir) = app.path().app_data_dir() {
                std::env::set_var("APP_DATA_DIR", data_dir.to_string_lossy().as_ref());
            }

            // ── Spawn Mastra sidecar ──────────────────────────────────────────────
            // In production (non-debug) mode, start the bundled mastra-server binary.
            // In debug mode we skip this because `pnpm dev:mastra` handles it
            // externally (faster iteration, hot-reload, etc.).
            #[cfg(not(debug_assertions))]
            {
                let sidecar_result = app
                    .shell()
                    .sidecar("mastra-server")
                    .map(|cmd| {
                        cmd.env("MASTRA_PORT", mastra_port.to_string())
                            .env(
                                "APP_DATA_DIR",
                                std::env::var("APP_DATA_DIR").unwrap_or_default(),
                            )
                    });

                match sidecar_result {
                    Ok(sidecar_cmd) => {
                        match sidecar_cmd.spawn() {
                            Ok((mut rx, _child)) => {
                                // Log sidecar stdout/stderr to Tauri bootstrap state.
                                let bootstrap_for_sidecar = bootstrap.clone();
                                spawn(async move {
                                    while let Some(event) = rx.recv().await {
                                        match event {
                                            CommandEvent::Stdout(line) => {
                                                let msg = String::from_utf8_lossy(&line)
                                                    .trim()
                                                    .to_string();
                                                if !msg.is_empty() {
                                                    push_bootstrap_log(
                                                        &bootstrap_for_sidecar,
                                                        "mastra",
                                                        &format!("[mastra] {}", msg),
                                                    );
                                                }
                                            }
                                            CommandEvent::Stderr(line) => {
                                                let msg = String::from_utf8_lossy(&line)
                                                    .trim()
                                                    .to_string();
                                                if !msg.is_empty() {
                                                    push_bootstrap_log(
                                                        &bootstrap_for_sidecar,
                                                        "mastra",
                                                        &format!("[mastra:err] {}", msg),
                                                    );
                                                }
                                            }
                                            CommandEvent::Terminated(status) => {
                                                let msg = format!(
                                                    "[mastra] sidecar exited with code {:?}",
                                                    status.code
                                                );
                                                set_bootstrap_error(
                                                    &bootstrap_for_sidecar,
                                                    "mastra-exited",
                                                    &msg,
                                                );
                                                break;
                                            }
                                            _ => {}
                                        }
                                    }
                                });
                            }
                            Err(e) => {
                                set_bootstrap_error(
                                    &bootstrap,
                                    "mastra-spawn-failed",
                                    &format!("Failed to spawn mastra-server sidecar: {}", e),
                                );
                            }
                        }
                    }
                    Err(e) => {
                        set_bootstrap_error(
                            &bootstrap,
                            "mastra-sidecar-not-found",
                            &format!("mastra-server sidecar not found: {}", e),
                        );
                    }
                }
            }

            // ── Start local Axum proxy server ────────────────────────────────────
            let router = create_router(api_base.clone(), mastra_base.clone());
            let address: SocketAddr = SERVER_ADDR.parse().expect("invalid local server address");

            {
                let mut state = bootstrap.lock().unwrap();
                *state = BootstrapState::new();
            }

            let bootstrap_for_server = bootstrap.clone();
            let api_base_for_bootstrap = api_base.clone();
            let mastra_base_for_bootstrap = mastra_base.clone();

            spawn(async move {
                let listener = match tokio::net::TcpListener::bind(address).await {
                    Ok(listener) => listener,
                    Err(error) => {
                        if can_reuse_existing_server(&api_base_for_bootstrap).await {
                            push_bootstrap_log(
                                &bootstrap_for_server,
                                "ready",
                                &format!("Reusing existing local API at {}", api_base_for_bootstrap),
                            );
                            let mut state = bootstrap_for_server.lock().unwrap();
                            state.ready = true;
                            return;
                        }

                        set_bootstrap_error(
                            &bootstrap_for_server,
                            "bind-failed",
                            &format!(
                                "Local API failed to bind {}: {}. Close the process using this port or change the port.",
                                api_base_for_bootstrap, error
                            ),
                        );
                        return;
                    }
                };

                let bootstrap_for_sequence = bootstrap_for_server.clone();
                let api_base = api_base_for_bootstrap.clone();
                let mastra_base = mastra_base_for_bootstrap.clone();

                spawn(async move {
                    run_bootstrap_sequence(bootstrap_for_sequence, mastra_base, api_base).await;
                });

                axum::serve(listener, router)
                    .await
                    .expect("failed to start local server");
            });

            if let Some(window) = app.get_webview_window("main") {
                window.set_title(APP_NAME)?;
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
