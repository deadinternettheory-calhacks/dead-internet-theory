import {
  httpRouter,
  httpActionGeneric as httpAction,
  anyApi,
} from "convex/server";
import { authenticate } from "../src/auth";
import { ApiFault, limits, validate } from "../src/core";
const router = httpRouter();
const handler = httpAction(async (ctx, req) => {
  const requestId = crypto.randomUUID();
  try {
    const principal = await authenticate(req.headers.get("authorization"));
    const url = new URL(req.url);
    let body: unknown = null;
    if (req.method === "POST") {
      if (
        !req.headers
          .get("content-type")
          ?.toLowerCase()
          .startsWith("application/json")
      )
        throw new ApiFault(
          400,
          "INVALID_REQUEST",
          "JSON content type required",
        );
      // Read incrementally; Content-Length is untrusted.
      const reader = req.body?.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      if (reader)
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > limits().bodyBytes) {
            await reader.cancel();
            throw new ApiFault(
              400,
              "INVALID_REQUEST",
              "Request exceeds configured byte limit",
            );
          }
          chunks.push(value);
        }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      try {
        body = JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(bytes),
        );
      } catch {
        throw new ApiFault(400, "INVALID_REQUEST", "Invalid JSON");
      }
    }
    const result = await ctx.runMutation(anyApi.api.execute, {
      method: req.method,
      path: url.pathname,
      body,
      key: req.headers.get("idempotency-key"),
      principal,
      requestId,
    });
    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
        "x-request-id": requestId,
        ...(result.status === 429 ? { "retry-after": "60" } : {}),
      },
    });
  } catch (e) {
    const fault =
      e instanceof ApiFault
        ? e
        : new ApiFault(500, "INTERNAL_ERROR", "Request could not be processed");
    return new Response(
      JSON.stringify(
        validate("ApiError", {
          error: {
            code: fault.code,
            message: fault.message,
            retryable: fault.retryable,
            requestId,
          },
        }),
      ),
      {
        status: fault.status,
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
          "x-request-id": requestId,
        },
      },
    );
  }
});
router.route({ path: "/v1/capabilities", method: "GET", handler });
router.route({ path: "/v1/investigations", method: "POST", handler });
router.route({ pathPrefix: "/v1/investigations/", method: "GET", handler });
router.route({ pathPrefix: "/v1/investigations/", method: "POST", handler });
export default router;
