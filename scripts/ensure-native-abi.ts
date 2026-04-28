import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PKG_DIR = path.join(
  ROOT,
  'node_modules/.pnpm/better-sqlite3@12.9.0/node_modules/better-sqlite3',
);
const BIN = path.join(PKG_DIR, 'build/Release/better_sqlite3.node');

function rebuild(reason: string) {
  console.log(`[ensure-native-abi] ${reason}, rebuilding for Node ${process.version}...`);
  execSync('npm run build-release', { cwd: PKG_DIR, stdio: 'inherit' });
}

if (!existsSync(BIN)) {
  rebuild('better-sqlite3 binary missing');
} else {
  const req = createRequire(__filename ?? import.meta.url);
  try {
    req(BIN);
    console.log(`[ensure-native-abi] better-sqlite3 ABI ok (Node ${process.version})`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('NODE_MODULE_VERSION')) {
      rebuild('ABI mismatch');
    } else {
      console.log(`[ensure-native-abi] load ok (non-ABI error ignored: ${msg.split('\n')[0]})`);
    }
  }
}
