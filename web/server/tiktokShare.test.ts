import { EventEmitter } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';
import { isTikTokShareUrl, publicAddress, resolveTikTokShareUrl, shareHead } from './tiktokShare';

const network = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }));
vi.mock('node:dns/promises', () => ({ lookup: network.lookup }));
vi.mock('node:https', () => ({ default: { request: network.request } }));
afterEach(() => vi.resetAllMocks());

const shared = 'https://www.tiktok.com/t/SHARED/';
const video = 'https://www.tiktok.com/@example/video/1234567890123456789';

it('resolves a share redirect without fetching the video page or retaining tracking', async () => {
  const head = vi.fn().mockResolvedValue({ status: 301, location: video + '?_t=tracking#fragment' });
  expect(await resolveTikTokShareUrl(shared, head)).toBe(video);
  expect(head.mock.calls).toEqual([[shared]]);
});

it('handles vm/vt shares with at most two constrained redirect headers', async () => {
  const head = vi.fn().mockResolvedValueOnce({ status: 302, location: shared }).mockResolvedValueOnce({ status: 307, location: video });
  expect(await resolveTikTokShareUrl('https://vm.tiktok.com/TOKEN/', head)).toBe(video);
  expect(head).toHaveBeenCalledTimes(2);
});

it.each(['http://www.tiktok.com/t/SHARED/', 'https://user@www.tiktok.com/t/SHARED/', 'https://www.tiktok.com:443/t/SHARED/', 'https://www.tiktok.com.evil.test/t/SHARED/', 'https://www.tiktok.com/t/%2e%2e', 'https://www.tiktok.com/@example', 'https://127.0.0.1/t/SHARED/'])(
  'does not fetch invalid share inputs: %s', async raw => {
    const head = vi.fn();
    expect(isTikTokShareUrl(raw)).toBe(false);
    expect(await resolveTikTokShareUrl(raw, head)).toBe(raw);
    expect(head).not.toHaveBeenCalled();
  },
);

it.each(['https://evil.test/@example/video/123', 'https://127.0.0.1/@example/video/123', 'http://www.tiktok.com/@example/video/123', 'https://user:secret@www.tiktok.com/@example/video/123', 'https://www.tiktok.com:8443/@example/video/123', 'https://www.tiktok.com/login'])(
  'rejects an unsafe or non-video redirect without fetching it: %s', async location => {
    const head = vi.fn().mockResolvedValue({ status: 302, location });
    await expect(resolveTikTokShareUrl(shared, head)).rejects.toThrow('full video URL');
    expect(head).toHaveBeenCalledTimes(1);
  },
);

it('rejects a redirect loop, missing location, or access denial without retries', async () => {
  const loop = vi.fn().mockResolvedValue({ status: 301, location: shared });
  await expect(resolveTikTokShareUrl(shared, loop)).rejects.toThrow();
  expect(loop).toHaveBeenCalledTimes(2);
  for (const result of [{ status: 301 }, { status: 403, location: video }]) {
    const head = vi.fn().mockResolvedValue(result);
    await expect(resolveTikTokShareUrl(shared, head)).rejects.toThrow();
    expect(head).toHaveBeenCalledTimes(1);
  }
});

it('rejects private, reserved and mapped private addresses', () => {
  for (const address of ['127.0.0.1', '10.1.1.1', '172.16.1.1', '192.168.1.1', '169.254.169.254', '0.0.0.0', '::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1', 'bad']) expect(publicAddress(address), address).toBe(false);
  for (const address of ['8.8.8.8', '2606:4700:4700::1111', '::ffff:8.8.8.8']) expect(publicAddress(address), address).toBe(true);
});

it('blocks DNS answers containing any private destination before connecting', async () => {
  network.lookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }]);
  await expect(shareHead(shared)).rejects.toThrow();
  expect(network.request).not.toHaveBeenCalled();
});

it('pins the checked public address and sends only HEAD with no credentials', async () => {
  const checked = { address: '8.8.8.8', family: 4 };
  network.lookup.mockResolvedValue([checked]);
  network.request.mockImplementation((_url, options, response) => {
    expect(options).toMatchObject({ method: 'HEAD', agent: false });
    expect(options.headers).toBeUndefined();
    const callback = vi.fn();
    options.lookup('www.tiktok.com', { all: true }, callback);
    expect(callback).toHaveBeenCalledWith(null, [checked]);
    const req = Object.assign(new EventEmitter(), { end: () => response({ statusCode: 301, headers: { location: video }, destroy: () => req.emit('close') }) });
    return req;
  });
  expect(await shareHead(shared)).toEqual({ status: 301, location: video });
  expect(network.lookup).toHaveBeenCalledTimes(1);
});
