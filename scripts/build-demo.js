import { copyFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'dist');
const sources = [
  'index.html', '_headers', 'assets/icon.svg',
  ...['app.js', 'model.js', 'views.js', 'history.js', 'history-period.js', 'editor.js',
    'settings.js', 'preferences.js', 'translations.js', 'demo-store.js', 'demo-samples.js',
    'styles.css', 'themes.css', 'account.css'].map(name => 'src/' + name),
];

for (const name of sources.filter(name => name.endsWith('.js'))) {
  if (/\bfetch\s*\(|\bXMLHttpRequest\b|\/api\//.test(readFileSync(join(root, name), 'utf8'))) {
    throw new Error('The static demo must not contain network API clients: ' + name);
  }
}
rmSync(output, { recursive: true, force: true });
for (const name of sources) {
  mkdirSync(dirname(join(output, name)), { recursive: true });
  copyFileSync(join(root, name), join(output, name));
}
console.log('Built ' + sources.length + ' public demo files in dist/.');
