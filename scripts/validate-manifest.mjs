// Keep upload metadata compatible with Komari releases whose Go Theme fields
// are strings. Newer releases also accept strings, so no localized objects ship.
export function validateManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw Error('Theme manifest must be an object.');
  for (const key of ['name', 'short', 'description', 'version', 'author', 'url', 'preview']) {
    if (manifest[key] !== undefined && typeof manifest[key] !== 'string') throw Error(`Theme.${key} must be a string for legacy Komari compatibility.`);
  }
  for (const key of ['name', 'short', 'version']) {
    if (!manifest[key]?.trim()) throw Error(`Theme.${key} must not be empty.`);
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(manifest.short) || manifest.short === 'default') throw Error('Invalid theme identifier.');
  const config = manifest.configuration;
  if (config === undefined) return;
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw Error('Theme.configuration must be an object.');
  for (const key of ['name', 'type', 'icon']) {
    if (config[key] !== undefined && typeof config[key] !== 'string') throw Error(`Theme.configuration.${key} must be a string for legacy Komari compatibility.`);
  }
  if ((config.type ?? 'managed') === 'managed') {
    if (!Array.isArray(config.data)) throw Error('Managed theme configuration.data must be an array.');
    for (const item of config.data) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw Error('Managed configuration item must be an object.');
      for (const key of ['key', 'name', 'type', 'options', 'help']) {
        if (item[key] !== undefined && typeof item[key] !== 'string') throw Error(`Managed configuration item.${key} must be a string for legacy Komari compatibility.`);
      }
    }
  }
}
