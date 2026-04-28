import { cp, mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(ROOT, '..');
const PNPM_STORE = path.join(REPO_ROOT, 'node_modules', '.pnpm');

const RESOLVERS = [
  createRequire(path.join(ROOT, 'package.json')),
  createRequire(path.join(REPO_ROOT, 'package.json')),
];

const RUNTIME_NATIVE_MODULES = ['better-sqlite3', 'libsql'];

const LIBSQL_PLATFORM_PACKAGES = [
  '@libsql/darwin-arm64',
  '@libsql/darwin-x64',
  '@libsql/linux-arm64-gnu',
  '@libsql/linux-arm64-musl',
  '@libsql/linux-x64-gnu',
  '@libsql/linux-x64-musl',
  '@libsql/linux-arm-gnueabihf',
  '@libsql/linux-arm-musleabihf',
  '@libsql/win32-x64-msvc',
];

function currentLibsqlPackage(): string | null {
  const platform = process.platform;
  const arch = process.arch;
  if (platform === 'darwin' && arch === 'arm64') return '@libsql/darwin-arm64';
  if (platform === 'darwin' && arch === 'x64') return '@libsql/darwin-x64';
  if (platform === 'linux' && arch === 'arm64') return '@libsql/linux-arm64-gnu';
  if (platform === 'linux' && arch === 'x64') return '@libsql/linux-x64-gnu';
  if (platform === 'win32' && arch === 'x64') return '@libsql/win32-x64-msvc';
  return null;
}

async function findPackageDir(name: string): Promise<string | null> {
  for (const req of RESOLVERS) {
    try {
      const entry = req.resolve(name);
      let dir = path.dirname(entry);
      while (dir !== path.dirname(dir)) {
        const pkg = path.join(dir, 'package.json');
        if (existsSync(pkg)) {
          const parsed = JSON.parse(await readFile(pkg, 'utf8'));
          if (parsed.name === name) return dir;
        }
        dir = path.dirname(dir);
      }
    } catch {}
  }
  if (existsSync(PNPM_STORE)) {
    const entries = await readdir(PNPM_STORE);
    const safeName = name.replace('/', '+');
    const match = entries.find((e) => e.startsWith(`${safeName}@`));
    if (match) {
      const candidate = path.join(PNPM_STORE, match, 'node_modules', name);
      if (existsSync(candidate) && statSync(candidate).isDirectory()) return candidate;
    }
  }
  return null;
}

async function copyPackage(name: string, destRoot: string, copied: Set<string>): Promise<string | null> {
  if (copied.has(name)) return null;
  const src = await findPackageDir(name);
  if (!src) {
    console.warn(`[copy-native] skip ${name} (not installed)`);
    return null;
  }
  const dest = path.join(destRoot, 'node_modules', name);
  await mkdir(path.dirname(dest), { recursive: true });
  await cp(src, dest, {
    recursive: true,
    dereference: true,
    filter: (s) => {
      const rel = path.relative(src, s);
      return !rel.split(path.sep).includes('node_modules');
    },
  });
  copied.add(name);
  console.log(`[copy-native] ${name}  <-  ${path.relative(ROOT, src)}`);
  return src;
}

async function copyWithDeps(name: string, destRoot: string, copied: Set<string>): Promise<void> {
  const src = await copyPackage(name, destRoot, copied);
  if (!src) return;
  const pkgPath = path.join(src, 'package.json');
  if (!existsSync(pkgPath)) return;
  const parsed = JSON.parse(await readFile(pkgPath, 'utf8'));
  const deps = { ...(parsed.dependencies ?? {}) };
  for (const dep of Object.keys(deps)) {
    await copyWithDeps(dep, destRoot, copied);
  }
}

export async function copyNativeModules(distDir: string): Promise<void> {
  const copied = new Set<string>();
  for (const name of RUNTIME_NATIVE_MODULES) {
    await copyWithDeps(name, distDir, copied);
  }
  const current = currentLibsqlPackage();
  const targets = current
    ? [current, ...LIBSQL_PLATFORM_PACKAGES.filter((p) => p !== current)]
    : LIBSQL_PLATFORM_PACKAGES;
  for (const name of targets) {
    await copyPackage(name, distDir, copied);
  }

  const pkg = {
    name: 'nls-mastra-dist',
    version: '0.0.0',
    private: true,
    main: 'server.cjs',
  };
  await writeFile(path.join(distDir, 'package.json'), JSON.stringify(pkg, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dist = path.resolve(process.argv[2] ?? path.join(ROOT, 'dist'));
  if (!existsSync(dist)) throw new Error(`dist dir not found: ${dist}`);
  copyNativeModules(dist).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
