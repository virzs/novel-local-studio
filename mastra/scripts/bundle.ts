import { build } from 'esbuild';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyNativeModules } from './copy-native.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

const NATIVE_EXTERNALS = [
  'better-sqlite3',
  'libsql',
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

async function main() {
  if (existsSync(DIST)) await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });

  const entry = path.join(ROOT, 'src/server.ts');
  const outfile = path.join(DIST, 'server.cjs');

  console.log('[bundle] esbuild', entry, '->', outfile);

  const result = await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    external: NATIVE_EXTERNALS,
    resolveExtensions: ['.ts', '.tsx', '.mjs', '.js', '.cjs', '.json'],
    sourcemap: 'linked',
    legalComments: 'none',
    minify: false,
    logLevel: 'info',
    metafile: true,
  });

  await writeFile(path.join(DIST, 'meta.json'), JSON.stringify(result.metafile, null, 2));
  console.log('[bundle] wrote', outfile);

  await copyNativeModules(DIST);
  console.log('[bundle] done');
}

main().catch((err) => {
  console.error('[bundle] failed', err);
  process.exit(1);
});
