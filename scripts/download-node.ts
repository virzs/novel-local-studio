import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, rename, rm, chmod, cp } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';

const NODE_VERSION = process.env.NLS_NODE_VERSION || 'v22.20.0';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const BIN_DIR = path.join(REPO_ROOT, 'app/src-tauri/binaries');

type Target = {
  triple: string;
  platform: NodeJS.Platform;
  arch: string;
  nodeDist: string;
  nodeArchive: 'tar.gz' | 'zip';
  nodeBinaryInArchive: string;
  outputExt: '' | '.exe';
};

const TARGETS: Record<string, Target> = {
  'aarch64-apple-darwin': {
    triple: 'aarch64-apple-darwin',
    platform: 'darwin',
    arch: 'arm64',
    nodeDist: 'darwin-arm64',
    nodeArchive: 'tar.gz',
    nodeBinaryInArchive: 'bin/node',
    outputExt: '',
  },
  'x86_64-apple-darwin': {
    triple: 'x86_64-apple-darwin',
    platform: 'darwin',
    arch: 'x64',
    nodeDist: 'darwin-x64',
    nodeArchive: 'tar.gz',
    nodeBinaryInArchive: 'bin/node',
    outputExt: '',
  },
  'x86_64-unknown-linux-gnu': {
    triple: 'x86_64-unknown-linux-gnu',
    platform: 'linux',
    arch: 'x64',
    nodeDist: 'linux-x64',
    nodeArchive: 'tar.gz',
    nodeBinaryInArchive: 'bin/node',
    outputExt: '',
  },
  'aarch64-unknown-linux-gnu': {
    triple: 'aarch64-unknown-linux-gnu',
    platform: 'linux',
    arch: 'arm64',
    nodeDist: 'linux-arm64',
    nodeArchive: 'tar.gz',
    nodeBinaryInArchive: 'bin/node',
    outputExt: '',
  },
  'x86_64-pc-windows-msvc': {
    triple: 'x86_64-pc-windows-msvc',
    platform: 'win32',
    arch: 'x64',
    nodeDist: 'win-x64',
    nodeArchive: 'zip',
    nodeBinaryInArchive: 'node.exe',
    outputExt: '.exe',
  },
};

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

async function downloadTo(url: string, dest: string): Promise<void> {
  console.log('[download-node]', url);
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`fetch failed ${res.status} ${url}`);
  await pipeline(res.body as any, createWriteStream(dest));
}

function sh(cmd: string, args: string[], cwd?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd, stdio: 'inherit' });
    p.on('error', reject);
    p.on('exit', (c) => (c === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exit ${c}`))));
  });
}

async function extractNodeBinary(archive: string, target: Target, outFile: string): Promise<void> {
  const tmpDir = path.join(path.dirname(archive), `extract-${Date.now()}`);
  await mkdir(tmpDir, { recursive: true });
  if (target.nodeArchive === 'tar.gz') {
    await sh('tar', ['-xzf', archive, '-C', tmpDir]);
  } else {
    await sh('unzip', ['-q', archive, '-d', tmpDir]);
  }
  const rootName = `node-${NODE_VERSION}-${target.nodeDist}`;
  const src = path.join(tmpDir, rootName, target.nodeBinaryInArchive);
  if (!existsSync(src)) throw new Error(`node binary not found in archive: ${src}`);
  await cp(src, outFile);
  await chmod(outFile, 0o755);
  await rm(tmpDir, { recursive: true, force: true });
}

async function fetchTarget(target: Target, force: boolean): Promise<void> {
  const binaryName = `node-${target.triple}${target.outputExt}`;
  const outFile = path.join(BIN_DIR, binaryName);
  if (!force && existsSync(outFile)) {
    console.log(`[download-node] exists, skip: ${binaryName}`);
    return;
  }
  await mkdir(BIN_DIR, { recursive: true });
  const archiveName = `node-${NODE_VERSION}-${target.nodeDist}.${target.nodeArchive}`;
  const archivePath = path.join(BIN_DIR, archiveName);
  const url = `https://nodejs.org/dist/${NODE_VERSION}/${archiveName}`;
  await downloadTo(url, archivePath);
  await extractNodeBinary(archivePath, target, outFile);
  await rm(archivePath, { force: true });
  console.log(`[download-node] wrote ${binaryName}`);
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const allFlag = args.includes('--all');
  const explicit = args.find((a) => !a.startsWith('--'));

  let triples: string[];
  if (allFlag) triples = Object.keys(TARGETS);
  else if (explicit) triples = [explicit];
  else triples = [detectCurrentTriple()];

  for (const t of triples) {
    const target = TARGETS[t];
    if (!target) throw new Error(`unknown target: ${t}`);
    await fetchTarget(target, force);
  }
}

main().catch((e) => {
  console.error('[download-node] failed', e);
  process.exit(1);
});
