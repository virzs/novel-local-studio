import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const NODE_VERSION = (process.env.NLS_NODE_VERSION || 'v22.20.0').replace(/^v/, '');

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const SRC = path.join(ROOT, 'mastra', 'dist');
const DEST = path.join(ROOT, 'app', 'src-tauri', 'resources', 'mastra');
const BIN_DIR = path.join(ROOT, 'app', 'src-tauri', 'binaries');

function detectCurrentTriple(): string {
  const p = process.platform;
  const a = process.arch;
  if (p === 'darwin' && a === 'arm64') return 'aarch64-apple-darwin';
  if (p === 'darwin' && a === 'x64') return 'x86_64-apple-darwin';
  if (p === 'linux' && a === 'x64') return 'x86_64-unknown-linux-gnu';
  if (p === 'linux' && a === 'arm64') return 'aarch64-unknown-linux-gnu';
  if (p === 'win32' && a === 'x64') return 'x86_64-pc-windows-msvc';
  throw new Error(`unsupported platform/arch: ${p}/${a}`);
}

function archForPrebuild(): string {
  const a = process.arch;
  if (a === 'arm64') return 'arm64';
  if (a === 'x64') return 'x64';
  throw new Error(`unsupported arch: ${a}`);
}

function sh(cmd: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd, stdio: 'inherit', env });
    p.on('error', reject);
    p.on('exit', (c) =>
      c === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exit ${c}`)),
    );
  });
}

async function copyDist() {
  if (!existsSync(SRC)) {
    throw new Error(`mastra dist not found at ${SRC}. Run: pnpm --filter @nls/mastra build`);
  }
  const s = await stat(SRC);
  if (!s.isDirectory()) throw new Error(`${SRC} is not a directory`);
  if (existsSync(DEST)) await rm(DEST, { recursive: true, force: true });
  await mkdir(path.dirname(DEST), { recursive: true });
  await cp(SRC, DEST, { recursive: true });
  console.log(`[prepare-resources] copied ${SRC} -> ${DEST}`);
}

async function rebuildBetterSqlite3() {
  const triple = detectCurrentTriple();
  const ext = triple.includes('windows') ? '.exe' : '';
  const nodeBin = path.join(BIN_DIR, `node-${triple}${ext}`);
  if (!existsSync(nodeBin)) {
    throw new Error(`bundled node not found: ${nodeBin}. Run: pnpm build:node`);
  }

  const pkgDir = path.join(DEST, 'node_modules', 'better-sqlite3');
  if (!existsSync(pkgDir)) {
    throw new Error(`better-sqlite3 not found in resources: ${pkgDir}`);
  }

  const runtime = 'node';
  const target = NODE_VERSION;
  const arch = archForPrebuild();
  const platform = process.platform === 'win32' ? 'win32' : process.platform;

  console.log(
    `[prepare-resources] prebuild-install better-sqlite3 target=${runtime}-v${target} ${platform}-${arch}`,
  );

  const env: NodeJS.ProcessEnv = { ...process.env, npm_config_build_from_source: 'false' };
  const prebuildBin = path.join(
    DEST,
    'node_modules',
    'prebuild-install',
    'bin.js',
  );
  if (!existsSync(prebuildBin)) {
    throw new Error(`prebuild-install not found: ${prebuildBin}`);
  }
  await sh(
    nodeBin,
    [
      prebuildBin,
      '--runtime',
      runtime,
      '--target',
      target,
      '--arch',
      arch,
      '--platform',
      platform,
      '--verbose',
    ],
    pkgDir,
    env,
  );

  console.log('[prepare-resources] better-sqlite3 rebuilt for bundled node');
}

async function main() {
  await copyDist();
  await rebuildBetterSqlite3();
}

main().catch((e) => {
  console.error('[prepare-resources] failed', e);
  process.exit(1);
});
