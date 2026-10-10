import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0, open: false } });
try {
  await server.listen();
  const port = server.httpServer.address().port;
  const code = await new Promise((resolve, reject) => {
    const processTest = spawn(process.execPath, ['--test', 'tests/function-audit.cjs', 'tests/editor-audit.cjs'], {
      cwd: root, stdio: 'inherit', env: { ...process.env, SHUATITONG_EDITOR_TEST_URL: `http://127.0.0.1:${port}/` },
    });
    processTest.on('error', reject); processTest.on('exit', resolve);
  });
  process.exitCode = code ?? 1;
} finally { await server.close(); }
