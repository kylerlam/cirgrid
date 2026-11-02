import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
let checked = 0;
for (const directory of ['src', 'scripts', 'test']) {
  for (const entry of readdirSync(new URL('../' + directory + '/', import.meta.url), { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
    const result = spawnSync(process.execPath, ['--check', directory + '/' + entry.name], { cwd: root, stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
    checked += 1;
  }
}
console.log('Checked ' + checked + ' JavaScript files.');
