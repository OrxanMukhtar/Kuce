import { cpSync, mkdirSync, rmSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const out = new URL('../www/', import.meta.url);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const item of ['index.html', 'manifest.webmanifest', 'icon.svg', 'src']) {
  cpSync(new URL(item, root), new URL(item, out), { recursive: true });
}
console.log('Static game copied to www/ for Capacitor.');
