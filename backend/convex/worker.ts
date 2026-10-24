"use node";
import { internalActionGeneric as action, anyApi } from "convex/server";
import { v } from "convex/values";
import { ApiFault, limits, stable, type Model } from "../src/core";
import { normalize } from "../src/graph";
import { fixtureDiscussion, fixtureHistory, emptySet } from "../src/fixture";
import { sample, type CandidateSet } from "../src/history";
import { deliver } from "../src/outbound";
import { advance, historySets, type PlanState } from "../src/providers";
export const tick = action({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const work = await ctx.runMutation(anyApi.jobs.claim, { key });
    if (!work) return;
    const { job } = work;
    try {
      let outcome: unknown;
      if (job.kind === "event") {
        await deliver(job.payload.event);
        outcome = { delivered: true };
      } else if (job.kind === "ingest") {
        const inv = work.investigation as Model<"InvestigationResource">;
        const snapshot = `snapshot:${key}`;
        let data;
        let raw;
        if ((process.env.PROVIDER_MODE ?? "fixture") === "fixture") {
          data = fixtureDiscussion(inv.platform, inv.sourceUrl, snapshot);
          raw = { synthetic: true, data };
        } else {
          const result = await advance({
            platform: inv.platform,
            url: inv.sourceUrl,
            kind: "discussion",
            state: job.payload as PlanState,
            reserve: (operation) =>
              ctx.runMutation(anyApi.jobs.reserve, {
                key,
                token: job.token,
                operation,
              }),
          });
          if (!result.done) {
            await ctx.runMutation(anyApi.jobs.settle, {
              key,
              token: job.token,
              outcome: { state: result.state, wait: 2000 },
            });
            return;
          }
          data = result.discussion!;
          data.sourceSnapshotRef = snapshot;
          raw = result.raw;
        }
        outcome = {
          graph: await normalize(
            inv.investigationId,
            inv.platform,
            inv.sourceUrl,
            data,
            limits().comments,
          ),
          raw,
        };
      } else if (job.kind === "enrich") {
        const graph = work.graph as Model<"GraphEnvelope">;
        const req = work.enrichment.request as Model<"EnrichmentRequest">;
        const authors = [...new Set(req.authors.map((p) => p.authorId))];
        const mode = process.env.PROVIDER_MODE ?? "fixture";
        const cacheKey = (author: string) =>
          stable([mode, graph.platform, author, "authored-150-v1"]);
        const cached = (await ctx.runMutation(anyApi.jobs.cached, {
          keys: authors.map(cacheKey),
        })) as Record<string, CandidateSet>;
        const sets = new Map<string, CandidateSet>();
        const caches: unknown[] = [];
        const missing = authors.filter((a) => !cached[cacheKey(a)]);
        if (["youtube", "tiktok"].includes(graph.platform)) {
          for (const author of authors)
            sets.set(author, emptySet("unsupported"));
        } else if (mode === "fixture") {
          for (const author of authors) {
            const set =
              cached[cacheKey(author)] ??
              fixtureHistory(author, `snapshot:${key}:${author}`);
            sets.set(author, set);
            if (!cached[cacheKey(author)])
              caches.push({
                key: cacheKey(author),
                set,
                raw: { synthetic: true, comments: set.comments },
              });
          }
        } else {
          for (const author of authors)
            if (cached[cacheKey(author)])
              sets.set(author, cached[cacheKey(author)]);
          if (missing.length) {
            try {
              const result = await advance({
                platform: graph.platform,
                kind: "history",
                authors: missing.map(
                  (id) =>
                    graph.nodes.find((n) => n.id === id) as Model<"AuthorNode">,
                ),
                state: job.payload as PlanState,
                reserve: (operation) =>
                  ctx.runMutation(anyApi.jobs.reserve, {
                    key,
                    token: job.token,
                    operation,
                  }),
              });
              if (!result.done) {
                await ctx.runMutation(anyApi.jobs.settle, {
                  key,
                  token: job.token,
                  outcome: { state: result.state, wait: 2000 },
                });
                return;
              }
              for (const [author, set] of historySets(
                graph.platform,
                missing,
                result.raw,
                `snapshot:${key}`,
              )) {
                sets.set(author, set);
                caches.push({ key: cacheKey(author), set, raw: result.raw });
              }
            } catch (e) {
              const f =
                e instanceof ApiFault
                  ? e
                  : new ApiFault(
                      500,
                      "PROVIDER_FAILED",
                      "History provider retrieval failed",
                      true,
                    );
              if (f.retryable && job.attempt + 1 < limits().attempts) throw f;
              for (const author of missing)
                sets.set(
                  author,
                  emptySet(
                    f.code === "PROVIDER_UNAVAILABLE"
                      ? "unavailable"
                      : "failed",
                    {
                      code: f.code,
                      message: f.message,
                      retryable: f.retryable,
                    },
                  ),
                );
            }
          }
        }
        const root = graph.nodes.find(
          (n) => n.id === graph.rootId,
        ) as Model<"DiscussionNode">;
        const results = req.authors.map((pair) =>
          sample(
            pair,
            graph.nodes.find(
              (n) => n.id === pair.anchorCommentId,
            ) as Model<"CommentNode">,
            root.nativeId,
            sets.get(pair.authorId)!,
            req.windowDays,
          ),
        );
        outcome = { results, caches };
      }
      await ctx.runMutation(anyApi.jobs.settle, {
        key,
        token: job.token,
        outcome,
      });
    } catch (e) {
      const f =
        e instanceof ApiFault
          ? e
          : new ApiFault(
              500,
              "PROVIDER_FAILED",
              "Background operation failed",
              true,
            );
      await ctx.runMutation(anyApi.jobs.settle, {
        key,
        token: job.token,
        outcome: {
          error: { code: f.code, message: f.message, retryable: f.retryable },
        },
      });
    }
  },
});
