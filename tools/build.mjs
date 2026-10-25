import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
if (dirname(dist) !== root) throw new Error('Unsafe output path');

await rm(dist, { recursive: true, force: true });
await mkdir(dist);
for (const name of ['index.html', 'style.css', 'manifest.webmanifest', 'src', 'assets']) {
  await cp(resolve(root, name), resolve(dist, name), { recursive: true });
}
console.log(`Built static game at ${dist}`);
