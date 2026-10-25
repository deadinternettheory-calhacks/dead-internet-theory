import { copyFile, mkdir } from 'node:fs/promises';

// Publish the same policy shipped in the extension, without a second policy copy.
const source = new URL('../../extension/public/', import.meta.url);
const destination = new URL('../dist/extension/', import.meta.url);
await mkdir(destination, { recursive: true });
for (const filename of ['privacy.html', 'privacy.css']) {
  await copyFile(new URL(filename, source), new URL(filename, destination));
}
