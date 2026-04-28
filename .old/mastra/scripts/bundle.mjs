/**
 * Bundle the Mastra sidecar server into a single CJS file using esbuild.
 *
 * Why esbuild instead of tsc:
 * - @mastra/core and friends are ESM-only; tsc cannot produce a CJS bundle from them.
 * - esbuild resolves everything into one file, which pkg can then package as a native binary.
 *
 * Native .node files (e.g. @libsql) are excluded from the bundle and must be placed
 * next to the final binary at runtime — Tauri's `resources` config handles this.
 */

import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const outdir = join(root, 'dist-bundle');

mkdirSync(outdir, { recursive: true });

await build({
  entryPoints: [join(root, 'src', 'server.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  outfile: join(outdir, 'server.cjs'),
  // Exclude native addons — pkg cannot embed .node files; they must ship alongside the binary.
  external: [
    '*.node',
    // Also exclude optional/dynamic requires that esbuild cannot resolve statically.
    'fsevents',
    '@anush008/tokenizers',
    '@anush008/tokenizers-darwin-universal',
    '@anush008/tokenizers-darwin-arm64',
    '@anush008/tokenizers-darwin-x64',
    '@anush008/tokenizers-linux-x64-gnu',
    '@anush008/tokenizers-linux-x64-musl',
    '@anush008/tokenizers-linux-arm64-gnu',
    '@anush008/tokenizers-linux-arm64-musl',
    '@anush008/tokenizers-linux-arm-gnueabihf',
    '@anush008/tokenizers-win32-x64-msvc',
    '@anush008/tokenizers-win32-arm64-msvc',
    '@anush008/tokenizers-win32-ia32-msvc',
    '@anush008/tokenizers-freebsd-x64',
    '@anush008/tokenizers-android-arm64',
    '@anush008/tokenizers-android-arm-eabi',
  ],
  // Let esbuild tree-shake and minify for a leaner output.
  minify: false,
  sourcemap: false,
  // Needed so that __dirname / __filename work inside CJS output.
  define: {},
  // Some @mastra packages use top-level await — handle via async IIFE wrapper.
  banner: {
    js: '// Bundled by esbuild — do not edit.\n',
  },
  logLevel: 'info',
});

console.log(`[bundle] Output: ${join(outdir, 'server.cjs')}`);
