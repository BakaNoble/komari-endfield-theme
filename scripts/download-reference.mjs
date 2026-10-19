import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
const root = 'https://raw.githubusercontent.com/hhikr/endfield-ui-skill/main/';
const files = ['SKILL.md', 'references/variation.md', 'references/components.md', 'references/motion.md', 'references/tokens.md', 'assets/tokens.json', 'assets/endfield.css', 'assets/contours/contour-a.svg', 'assets/contours/contour-b.svg'];
await Promise.all(files.map(async file => {
  const response = await fetch(root + file, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw Error(`${file}: ${response.status}`);
  const path = `design/endfield-ui/${file}`;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, Buffer.from(await response.arrayBuffer()));
}));
await mkdir('public/fonts', { recursive: true });
await Promise.all(['Saira.ttf', 'Saira-OFL.txt'].map(async file => {
  const response = await fetch(root + 'templates/flutter/fonts/' + file, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw Error(`${file}: ${response.status}`);
  await writeFile(`public/fonts/${file}`, Buffer.from(await response.arrayBuffer()));
}));
console.log('Endfield design reference, CSS kit and licensed Saira font saved.');
