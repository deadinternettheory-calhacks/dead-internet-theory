import { describe, it, expect } from "vitest";
import { validate, stable, capabilities } from "../src/core";
import { source } from "../src/url";
import fs from "node:fs";
describe("canonical validation and safe URL boundary", () => {
  it("validates all published synthetic examples with Draft 2020-12 formats", () => {
    const models: Record<string, string> = {
      graph: "GraphEnvelope",
      investigation: "InvestigationResource",
      "enrichment-request": "EnrichmentRequest",
      "enrichment-completed": "EnrichmentJob",
      "enrichment-unsupported": "EnrichmentJob",
      "analysis-submission": "AnalysisSubmission",
      "analysis-resource": "AnalysisResource",
      capabilities: "CapabilityResponse",
      "investigation-ready-event": "InvestigationReadyEvent",
      error: "ApiError",
    };
    for (const [file, name] of Object.entries(models))
      expect(() =>
        validate(
          name as Parameters<typeof validate>[0],
          JSON.parse(
            fs.readFileSync(`../contracts/examples/${file}.json`, "utf8"),
          ),
        ),
      ).not.toThrow();
    expect(() => validate("Timestamp", "2026-02-30T10:00:00Z")).toThrow();
    expect(() => validate("Timestamp", "2026-01-01T10:00:00+01:00")).toThrow();
  });
  it.each([
    "http://reddit.com/r/a/comments/abc",
    "https://reddit.com:443/r/a/comments/abc",
    "https://reddit.com.evil/r/a/comments/abc",
    "https://user@reddit.com/r/a/comments/abc",
    "https://127.0.0.1/",
    "https://[::1]/",
    "https://2130706433/",
    "https://reddit.com./r/a/comments/abc",
    "https://reddit.com\\@evil.com/",
    "https://%72eddit.com/r/a/comments/abc",
    "https://reddit.com/r/a/comments/%61bc",
    "https://redd.it/abc",
    "https://reddit.com/r/a/comments/abc/../../private",
  ])("rejects hostile or unresolved URL %s", (url) =>
    expect(() => source(url)).toThrow(),
  );
  it.each([
    ["https://old.reddit.com/r/test/comments/abc/title/?sort=new", "reddit"],
    ["https://twitter.com/test/status/123", "x"],
    ["https://youtu.be/abcdefghijk", "youtube"],
    ["https://www.tiktok.com/@test/video/123", "tiktok"],
  ])("canonicalizes %s", (url, p) => expect(source(url).platform).toBe(p));
  it("sorts object keys and reports all four reviewed providers", () => {
    expect(stable({ b: 1, a: 2 })).toBe(stable({ a: 2, b: 1 }));
    const entries = capabilities().platforms;
    expect(
      entries.find((p) => p.platform === "reddit")!.actorRuntimeVerified,
    ).toBe(true);
    expect(
      entries.filter((p) => p.actorRuntimeVerified).map((p) => p.platform),
    ).toEqual(["reddit", "x", "youtube", "tiktok"]);
  });
});
