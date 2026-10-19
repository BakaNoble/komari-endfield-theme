import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateManifest } from '../scripts/validate-manifest.mjs';

const manifest = JSON.parse(await readFile(new URL('../komari-theme.json', import.meta.url), 'utf8'));

test('upload manifest uses string metadata accepted by legacy Go Theme fields', () => {
  assert.doesNotThrow(() => validateManifest(manifest));
  assert.equal(typeof manifest.name, 'string');
  assert.equal(typeof manifest.description, 'string');
  assert.equal(typeof manifest.configuration.name, 'string');
});
test('packaging rejects the localized objects that caused the upload failure', () => {
  for (const key of ['name', 'description', 'author']) {
    assert.throws(() => validateManifest({ ...manifest, [key]: { 'zh-CN': '测试' } }), new RegExp(`Theme\\.${key} must be a string`));
  }
  assert.throws(() => validateManifest({ ...manifest, configuration: { ...manifest.configuration, name: { 'zh-CN': '测试' } } }), /configuration\.name must be a string/);
});
test('release version stays consistent across theme metadata, package and lockfile', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));
  assert.equal(pkg.version, manifest.version);
  assert.equal(lock.version, manifest.version);
  assert.equal(lock.packages[''].version, manifest.version);
});
