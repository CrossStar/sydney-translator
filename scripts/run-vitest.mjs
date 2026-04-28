import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const repoTempDir = join(process.cwd(), '.tmp');
mkdirSync(repoTempDir, { recursive: true });

const args = ['./node_modules/vitest/vitest.mjs', ...process.argv.slice(2)];

const child = spawn(process.execPath, args, {
  stdio: 'inherit',
  env: {
    ...process.env,
    TMPDIR: repoTempDir,
    TMP: repoTempDir,
    TEMP: repoTempDir
  }
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
