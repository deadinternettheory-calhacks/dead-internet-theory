import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = path.join(root, 'dist');
const manifest = JSON.parse(await readFile(path.join(dist, 'manifest.json'), 'utf8'));
if (manifest.manifest_version !== 3) throw new Error('Manifest V3 is required.');
for (const filename of ['sidepanel.html', 'report.html', 'service-worker.js', 'privacy.html', ...Object.values(manifest.icons)]) await readFile(path.join(dist, filename));
async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? files(path.join(dir, entry.name)) : path.join(dir, entry.name)))).flat();
}
for (const filename of await files(dist)) {
  if (/\.(?:map|pem|key)$|(?:^|\/)\.env/.test(filename)) throw new Error('Unexpected private/build file in package.');
  if (/\.(?:js|json|html)$/.test(filename)) {
    const text = await readFile(filename, 'utf8');
    if (/BACKEND_JWT_SECRET|ANTHROPIC_API_KEY|APIFY_TOKEN|CONVEX_DEPLOY_KEY|AUTH_JWT_SECRET/.test(text)) throw new Error('Unexpected server configuration in client package.');
    if (/syn_espresso|best_budget_espresso_machine|BrewMaster Mini/.test(text)) throw new Error('Unexpected synthetic fixture in client package.');
  }
}
const output = path.resolve(root, '../output');
await mkdir(output, { recursive: true });
const zip = path.join(output, `dead-internet-theory-chrome-${manifest.version}.zip`);
execFileSync('python3', ['-c', 'import pathlib,sys,zipfile; root=pathlib.Path(sys.argv[1]); archive=zipfile.ZipFile(sys.argv[2],"w",zipfile.ZIP_DEFLATED); [archive.write(p,p.relative_to(root)) for p in sorted(root.rglob("*")) if p.is_file()]; archive.close()', dist, zip]);
const sha256 = createHash('sha256').update(await readFile(zip)).digest('hex');
await writeFile(`${zip}.sha256`, `${sha256}  ${path.basename(zip)}\n`);
console.log(`ZIP: ${zip}\nSHA-256: ${sha256}`);
