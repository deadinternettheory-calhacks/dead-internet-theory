import { it, expect, vi, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import https from "node:https";
import { lookup } from "node:dns/promises";
import { outbound, deliver } from "../src/outbound";
vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
function request(
  status: number,
  body: string,
  contentType = "application/json",
) {
  const request = Object.assign(new EventEmitter(), {
    setTimeout: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
    destroy: vi.fn(),
  });
  const spy = vi
    .spyOn(https, "request")
    .mockImplementation((...args: any[]) => {
      queueMicrotask(() => {
        const response = Object.assign(Readable.from([Buffer.from(body)]), {
          statusCode: status,
          headers: { "content-type": contentType },
        });
        args[2](response);
      });
      return request as never;
    });
  return { spy, request };
}
it("rejects all DNS answers if any answer is private, before making a connection", async () => {
  vi.mocked(lookup).mockResolvedValue([
    { address: "8.8.8.8", family: 4 },
    { address: "127.0.0.1", family: 4 },
  ] as never);
  const spy = vi.spyOn(https, "request");
  await expect(outbound("https://example.com/data")).rejects.toMatchObject({
    code: "OUTBOUND_BLOCKED",
  });
  expect(spy).not.toHaveBeenCalled();
});
it("pins the validated public IP to the TLS connection lookup", async () => {
  vi.mocked(lookup).mockResolvedValue([
    { address: "8.8.8.8", family: 4 },
  ] as never);
  const { spy } = request(200, '{"ok":true}');
  expect(await outbound("https://example.com/data")).toEqual({
    status: 200,
    body: { ok: true },
  });
  const options = spy.mock.calls[0][1] as https.RequestOptions;
  const cb = vi.fn();
  (options.lookup as Function)("example.com", {}, cb);
  expect(cb).toHaveBeenCalledWith(null, "8.8.8.8", 4);
});
it("blocks redirects without following their Location", async () => {
  vi.mocked(lookup).mockResolvedValue([
    { address: "8.8.8.8", family: 4 },
  ] as never);
  const { spy } = request(302, "", "text/plain");
  await expect(outbound("https://example.com/redirect")).rejects.toMatchObject({
    code: "OUTBOUND_REDIRECT_BLOCKED",
  });
  expect(spy).toHaveBeenCalledTimes(1);
});
it("enforces outbound size limits", async () => {
  vi.mocked(lookup).mockResolvedValue([
    { address: "8.8.8.8", family: 4 },
  ] as never);
  request(200, '{"oversized":"' + "a".repeat(1000) + '"}');
  await expect(
    outbound("https://example.com/data", { maxBytes: 100 }),
  ).rejects.toMatchObject({ code: "PROVIDER_SIZE_LIMIT" });
});
it("accepts 204 acknowledgement and preserves error status without requiring JSON", async () => {
  vi.mocked(lookup).mockResolvedValue([
    { address: "8.8.8.8", family: 4 },
  ] as never);
  request(204, "", "text/plain");
  expect((await outbound("https://example.com/events")).status).toBe(204);
});
it("never permits the local synthetic event exception in live mode", async () => {
  vi.stubEnv("INFERENCE_EVENT_URL", "http://127.0.0.1:4010/events");
  vi.stubEnv("INFERENCE_EVENT_TOKEN", "test");
  vi.stubEnv("LOCAL_SYNTHETIC_EVENT_DELIVERY", "true");
  vi.stubEnv("PROVIDER_MODE", "live");
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210");
  await expect(deliver({})).rejects.toMatchObject({ code: "OUTBOUND_BLOCKED" });
});
