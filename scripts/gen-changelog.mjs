// Кладе src/changelog.ts у public/changelog.json — плашка оновлення
// тягне його з нового деплою ще до перезавантаження.
// Запускається першим кроком npm run build.
import esbuild from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import fs from 'fs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, 'scripts', '.changelog-bundle.mjs');

await esbuild.build({
  entryPoints: [path.join(root, 'src', 'changelog.ts')],
  bundle: true, format: 'esm', outfile: out, platform: 'node',
});
const { APP_VERSION, CHANGES } = await import(pathToFileURL(out).href);
fs.writeFileSync(
  path.join(root, 'public', 'changelog.json'),
  JSON.stringify({ version: APP_VERSION, changes: CHANGES }, null, 2),
);
fs.rmSync(out, { force: true });
console.log(`changelog.json → ${APP_VERSION} (${CHANGES.length} пунктів)`);
