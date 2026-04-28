import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const envPath = resolve(root, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

const services = [
  { name: 'mastra', cmd: 'pnpm', args: ['--filter', '@novel-local-studio/mastra', 'dev'], cwd: root },
  { name: 'web',    cmd: 'pnpm', args: ['--dir', 'app', 'dev'],                     cwd: root },
];

const children = services.map(({ name, cmd, args, cwd }) => {
  const child = spawn(cmd, args, { cwd, stdio: 'inherit', shell: false, env: process.env });
  child.on('exit', (code) => {
    if (code !== null && code !== 0) {
      console.error(`[${name}] exited with code ${code}, shutting down…`);
      children.forEach(c => c.kill());
      process.exit(code);
    }
  });
  return child;
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    children.forEach(c => c.kill());
    process.exit(0);
  });
}
