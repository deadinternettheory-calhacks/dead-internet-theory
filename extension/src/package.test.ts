import { afterEach, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { packageExtension } from '../scripts/package.mjs';
import manifest from '../public/manifest.json';

const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map(directory => rm(directory, { recursive: true, force: true }))); });

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'dit-package-')); temporary.push(root);
  const dist = path.join(root, 'dist'), output = path.join(root, 'output');
  await mkdir(path.join(dist, 'icons'), { recursive: true });
  await mkdir(path.join(dist, 'assets'));
  for (const filename of ['sidepanel.html', 'report.html', 'privacy.html', 'service-worker.js', ...Object.values(manifest.icons), 'assets/runtime.js', 'INSTALL.txt']) await writeFile(path.join(dist, filename), `packaged ${filename}`);
  await writeFile(path.join(dist, 'manifest.json'), JSON.stringify(manifest));
  return { dist, output };
}

it('creates a keyless store upload and a pinned unpacked ZIP with the same executable payload', async () => {
  const { dist, output } = await fixture();
  const artifacts = await packageExtension(dist, output);
  expect(artifacts.map(artifact => artifact.target)).toEqual(['unpacked', 'webstore']);
  for (const artifact of artifacts) {
    const inspected = JSON.parse(execFileSync('python3', ['-c', 'import json,zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); print(json.dumps({"manifest":json.loads(z.read("manifest.json")),"entries":z.namelist(),"runtime":z.read("assets/runtime.js").decode()}))', artifact.zip], { encoding: 'utf8' }));
    expect(inspected.manifest.version).toBe(manifest.version);
    expect(inspected.runtime).toBe('packaged assets/runtime.js');
    if (artifact.target === 'webstore') {
      expect(inspected.manifest).not.toHaveProperty('key');
      expect(inspected.entries).not.toContain('INSTALL.txt');
      expect(path.basename(artifact.zip)).toContain('-webstore-');
    } else expect(inspected.manifest.key).toBe(manifest.key);
    expect(inspected.entries).toContain('manifest.json');
    expect(createHash('sha256').update(await readFile(artifact.zip)).digest('hex')).toBe(artifact.sha256);
    expect((await readFile(`${artifact.zip}.sha256`, 'utf8')).split(' ')[0]).toBe(artifact.sha256);
  }
  expect(JSON.parse(await readFile(path.join(dist, 'manifest.json'), 'utf8')).key).toBe(manifest.key);
});

it('rejects private files instead of publishing them in either artifact', async () => {
  const { dist, output } = await fixture();
  await writeFile(path.join(dist, 'key.pem'), 'must not ship');
  await expect(packageExtension(dist, output)).rejects.toThrow('Unexpected private/build file');
});
