export type CliArgs = {
  port: number;
  dataDir: string;
};

export function parseArgs(argv: string[]): CliArgs {
  let port = Number(process.env.NLS_PORT ?? 0);
  let dataDir = process.env.NLS_DATA_DIR ?? '';

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--port' && argv[i + 1]) {
      port = Number(argv[++i]);
    } else if (a === '--data-dir' && argv[i + 1]) {
      dataDir = argv[++i]!;
    }
  }

  if (!Number.isFinite(port) || port <= 0) {
    throw new Error('--port is required (or env NLS_PORT)');
  }
  if (!dataDir) {
    throw new Error('--data-dir is required (or env NLS_DATA_DIR)');
  }
  return { port, dataDir };
}
