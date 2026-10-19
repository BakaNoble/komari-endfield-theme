import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { zipSync, strToU8, unzipSync } from 'fflate';
import { validateManifest } from './validate-manifest.mjs';
const manifest = JSON.parse(await readFile('komari-theme.json', 'utf8'));
validateManifest(manifest);
const packageInfo = JSON.parse(await readFile('package.json', 'utf8'));
if (packageInfo.version !== manifest.version) throw Error('Package and theme versions must match.');
const index = await readFile('dist/index.html', 'utf8');
for (const expected of ['<title>Komari Monitor</title>', '<meta name="description" content="A simple server monitor tool."', '</head>', '</body>']) {
  if (!index.includes(expected)) throw Error(`Missing required Komari placeholder: ${expected}`);
}
const files = { 'komari-theme.json': strToU8(JSON.stringify(manifest, null, 2)) };
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path);
    else files[path.replaceAll('\\', '/')] = new Uint8Array(await readFile(path));
  }
}
await walk('dist');
for (const path of ['preview.png', 'README.md', 'docs/assets/ai-generated.png', 'LICENSE', 'THIRD_PARTY_NOTICES.md']) {
  files[path] = new Uint8Array(await readFile(path));
}
for (const dependency of ['react', 'react-dom', 'lucide-react']) {
  files[`licenses/${dependency}-LICENSE`] = new Uint8Array(await readFile(`node_modules/${dependency}/LICENSE`));
}
const output = `release/komari-endfield-${manifest.version}.zip`;
await mkdir('release', { recursive: true });
const zip = zipSync(files, { level: 6 });
const entries = unzipSync(zip);
if (!entries['komari-theme.json'] || !entries['dist/index.html']) throw Error('Archive structure invalid.');
validateManifest(JSON.parse(new TextDecoder().decode(entries['komari-theme.json'])));
await writeFile(output, zip);
const hash = createHash('sha256').update(zip).digest('hex');
await writeFile(`${output}.sha256`, `${hash}  komari-endfield-${manifest.version}.zip\n`);
console.log(`Verified theme package: ${output}\n${Object.keys(entries).length} files / ${(zip.length / 1024).toFixed(0)} KiB\nSHA-256: ${hash}`);
