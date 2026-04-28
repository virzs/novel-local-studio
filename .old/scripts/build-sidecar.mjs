/**
 * Build the Mastra sidecar binary and place it in src-tauri/binaries/
 * with the correct platform target triple suffix required by Tauri.
 *
 * Run: node scripts/build-sidecar.mjs
 *
 * Steps:
 *   1. esbuild-bundle Mastra TypeScript → dist-bundle/server.cjs
 *   2. pkg dist-bundle/server.cjs → dist-bin/mastra-server[.exe]
 *   3. Get current host target triple via `rustc --print host-tuple`
 *   4. Copy to src-tauri/binaries/mastra-server-<triple>[.exe]
 */

import { execSync, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const mastraDir = join(root, 'mastra');
const binariesDir = join(root, 'app', 'src-tauri', 'binaries');
const ext = process.platform === 'win32' ? '.exe' : '';

mkdirSync(binariesDir, { recursive: true });

console.log('→ Bundling Mastra with esbuild…');
execFileSync('node', ['scripts/bundle.mjs'], { cwd: mastraDir, stdio: 'inherit' });

console.log('→ Packaging with pkg…');
const bundleFile = join(mastraDir, 'dist-bundle', 'server.cjs');
const outBin = join(mastraDir, 'dist-bin', `mastra-server${ext}`);
mkdirSync(join(mastraDir, 'dist-bin'), { recursive: true });

execFileSync(
  'pnpm',
  [
    'exec',
    'pkg',
    bundleFile,
    '--target', `node20-${pkgPlatform()}-${pkgArch()}`,
    '--output', join(mastraDir, 'dist-bin', 'mastra-server'),
    '--no-bytecode',
    '--public',
  ],
  { cwd: mastraDir, stdio: 'inherit' }
);

if (!existsSync(outBin)) {
  console.error(`pkg output not found: ${outBin}`);
  process.exit(1);
}

console.log('→ Detecting Rust host target triple…');
const targetTriple = execSync('rustc --print host-tuple').toString().trim();
if (!targetTriple) {
  console.error('Could not determine Rust target triple. Is rustc installed?');
  process.exit(1);
}

const dest = join(binariesDir, `mastra-server-${targetTriple}${ext}`);
copyFileSync(outBin, dest);
console.log(`✓ Sidecar binary written to: ${dest}`);

function pkgPlatform() {
  switch (process.platform) {
    case 'darwin': return 'macos';
    case 'win32': return 'win';
    default: return 'linux';
  }
}

function pkgArch() {
  const arch = process.arch;
  if (arch === 'arm64') return 'arm64';
  return 'x64';
}
