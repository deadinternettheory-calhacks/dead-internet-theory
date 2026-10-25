import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? files(path.join(dir, entry.name)) : path.join(dir, entry.name)))).flat();
}

/** Build separate artifacts without changing the unpacked development manifest. */
export async function packageExtension(dist, output, targets = ['unpacked', 'webstore']) {
  if (!targets.length || targets.some(target => !['unpacked', 'webstore'].includes(target))) throw new Error('Choose unpacked or webstore.');
  const manifest = JSON.parse(await readFile(path.join(dist, 'manifest.json'), 'utf8'));
  if (manifest.manifest_version !== 3) throw new Error('Manifest V3 is required.');
  if (!manifest.key) throw new Error('The unpacked build must retain its development public key.');
  for (const filename of ['sidepanel.html', 'report.html', 'service-worker.js', 'privacy.html', ...Object.values(manifest.icons)]) await readFile(path.join(dist, filename));
  for (const filename of await files(dist)) {
    if (/\.(?:map|pem|key)$|(?:^|\/)\.env/.test(filename)) throw new Error('Unexpected private/build file in package.');
    if (/\.(?:js|json|html)$/.test(filename)) {
      const text = await readFile(filename, 'utf8');
      if (/BACKEND_JWT_SECRET|ANTHROPIC_API_KEY|APIFY_TOKEN|CONVEX_DEPLOY_KEY|AUTH_JWT_SECRET/.test(text)) throw new Error('Unexpected server configuration in client package.');
      if (/syn_espresso|best_budget_espresso_machine|BrewMaster Mini/.test(text)) throw new Error('Unexpected synthetic fixture in client package.');
    }
  }
  await mkdir(output, { recursive: true });
  const artifacts = [];
  for (const target of targets) {
    const suffix = target === 'webstore' ? '-webstore' : '';
    const zip = path.join(output, `dead-internet-theory-chrome${suffix}-${manifest.version}.zip`);
    execFileSync('python3', ['-c', `
import json,pathlib,sys,zipfile
root=pathlib.Path(sys.argv[1]); target=sys.argv[3]
with zipfile.ZipFile(sys.argv[2], 'w', zipfile.ZIP_DEFLATED) as archive:
 for file in sorted(root.rglob('*')):
  if not file.is_file(): continue
  name=file.relative_to(root).as_posix()
  if target=='webstore' and name=='INSTALL.txt': continue
  if target=='webstore' and name=='manifest.json':
   manifest=json.loads(file.read_text()); manifest.pop('key',None)
   archive.writestr(name,json.dumps(manifest,indent=2)+'\\n')
  else: archive.write(file,name)
with zipfile.ZipFile(sys.argv[2]) as archive:
 manifest=json.loads(archive.read('manifest.json'))
 assert ('key' in manifest)==(target=='unpacked')
 assert archive.testzip() is None
`, dist, zip, target]);
    const sha256 = createHash('sha256').update(await readFile(zip)).digest('hex');
    await writeFile(`${zip}.sha256`, `${sha256}  ${path.basename(zip)}\n`);
    artifacts.push({ target, zip, sha256 });
  }
  return artifacts;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const flag = process.argv[2];
  if (flag && !['--webstore', '--unpacked'].includes(flag)) throw new Error('Expected --webstore or --unpacked.');
  const targets = flag ? [flag.slice(2)] : ['unpacked', 'webstore'];
  for (const artifact of await packageExtension(path.join(root, 'dist'), path.resolve(root, '../output'), targets)) console.log(`${artifact.target} ZIP: ${artifact.zip}\nSHA-256: ${artifact.sha256}`);
}
