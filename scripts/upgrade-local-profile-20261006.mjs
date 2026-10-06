/** Preserve local profile preferences while selecting the native upgraded Ego bundle. */
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';
const home = resolve(process.argv[2] ?? '');
if (!process.argv[2]) throw new Error('Pass an explicit DSH_HOME; migration never guesses a data directory.');
const path = join(home, 'profiles/web/package.json');
if (existsSync(path)) {
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  for (const section of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    if (manifest[section]) delete manifest[section]['dsh-ego-browser'];
  }
  const profile = manifest.dsh?.profile;
  if (profile?.bundles) profile.bundles = profile.bundles.filter(name => name !== 'dsh-ego-browser');
  writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n');
  const legacy = join(home, 'profiles/web/node_modules/dsh-ego-browser');
  if (existsSync(legacy)) {
    const backupRoot = join(home, 'profiles/web/upgrade-backups');
    mkdirSync(backupRoot, { recursive: true, mode: 0o700 });
    renameSync(legacy, join(backupRoot, `ego-browser-before-0.2.1-${Date.now()}`));
  }
  console.log('Profile now resolves Ego Browser from this installation. Legacy package preserved outside node_modules.');
}
