"use node";
import { internalActionGeneric as action, anyApi } from "convex/server";
import { v } from "convex/values";
import {
  ApiFault,
  limits,
  stable,
  type Model,
  type ProviderMode,
} from "../src/core";
import { normalize } from "../src/graph";
import { fixtureDiscussion, fixtureHistory, emptySet } from "../src/fixture";
import { sample, type CandidateSet } from "../src/history";
import { deliver } from "../src/outbound";
import { advance, historySets, type PlanState } from "../src/providers";
interface HistoryContext {
  mode: ProviderMode;
  missing: string[];
  sets: Record<string, CandidateSet>;
}
export const tick = action({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const work = await ctx.runMutation(anyApi.jobs.claim, { key });
    if (!work) return;
    const { job } = work;
    const observe = (operation: string, runId: string, status: string) =>
      ctx.runMutation(anyApi.jobs.observeRun, {
        key,
        token: job.token,
        operation,
        runId,
        status,
      });
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
        if (work.providerMode === "fixture") {
          data = fixtureDiscussion(inv.platform, inv.sourceUrl, snapshot);
          raw = { synthetic: true, data };
        } else {
          const result = await advance({
            platform: inv.platform,
            url: inv.sourceUrl,
            kind: "discussion",
            state: job.payload as PlanState,
            observe,
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
        const context = job.payload.historyContext as
          HistoryContext | undefined;
        const mode = context?.mode ?? (work.providerMode as ProviderMode);
        const cacheKey = (author: string) =>
          stable([mode, graph.platform, author, "authored-150-v1"]);
        const sets = new Map<string, CandidateSet>(
          Object.entries(context?.sets ?? {}),
        );
        const caches: { key: string; set: CandidateSet }[] = [];
        const snapshots = new Map<string, unknown>();
        if (["youtube", "tiktok"].includes(graph.platform)) {
          for (const author of authors)
            sets.set(author, emptySet("unsupported"));
        } else if (!context) {
          // Freeze candidate cache hits and the author plan before any external
          // work. Later cache fills/expiry cannot change a running job's scope.
          const cached = (await ctx.runMutation(anyApi.jobs.cached, {
            keys: authors.map(cacheKey),
          })) as Record<string, CandidateSet>;
          const initialSets: Record<string, CandidateSet> = {};
          for (const author of authors)
            if (cached[cacheKey(author)])
              initialSets[author] = cached[cacheKey(author)];
          const historyContext: HistoryContext = {
            mode,
            sets: initialSets,
            missing: authors.filter((a) => !initialSets[a]),
          };
          await ctx.runMutation(anyApi.jobs.settle, {
            key,
            token: job.token,
            outcome: { state: { ...job.payload, historyContext }, wait: 0 },
          });
          return;
        } else if (mode === "fixture") {
          for (const author of context.missing) {
            const set = fixtureHistory(author, `snapshot:${key}:${author}`);
            sets.set(author, set);
            caches.push({ key: cacheKey(author), set });
            if (set.coverage.sourceSnapshotRef)
              snapshots.set(set.coverage.sourceSnapshotRef, {
                synthetic: true,
                comments: set.comments,
              });
          }
        } else if (context.missing.length) {
          const missing = context.missing;
          try {
            const result = await advance({
              platform: graph.platform,
              kind: "history",
              authors: missing.map(
                (id) =>
                  graph.nodes.find((n) => n.id === id) as Model<"AuthorNode">,
              ),
              state: job.payload as PlanState,
              observe,
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
                outcome: {
                  state: { ...result.state, historyContext: context },
                  wait: 2000,
                },
              });
              return;
            }
            const snapshot = `snapshot:${key}`;
            snapshots.set(snapshot, result.raw);
            for (const [author, set] of historySets(
              graph.platform,
              missing,
              result.raw,
              snapshot,
            )) {
              sets.set(author, set);
              if (set.status !== "failed")
                caches.push({ key: cacheKey(author), set });
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
            const raw = (job.payload as PlanState).tasks ?? [];
            const snapshot = `snapshot:${key}`;
            const hasCollectedRows = raw.some((t) => t.rows.length > 0);
            const recovered = hasCollectedRows
              ? historySets(graph.platform, missing, raw, snapshot)
              : new Map<string, CandidateSet>();
            if (hasCollectedRows) snapshots.set(snapshot, raw);
            for (const author of missing) {
              const set = recovered.get(author);
              if (set && set.comments.length && set.status !== "failed") {
                set.coverage.limitations.push(
                  "Batch stopped after a provider failure; already-collected evidence was retained.",
                );
                if (
                  raw.some(
                    (t) =>
                      (!t.authorIds || t.authorIds.includes(author)) && !t.done,
                  )
                )
                  set.coverage.limitations.push(
                    "Candidate paging did not finish.",
                  );
                sets.set(author, set);
                if (
                  raw
                    .filter((t) => !t.authorIds || t.authorIds.includes(author))
                    .every((t) => t.done)
                )
                  caches.push({ key: cacheKey(author), set });
              } else {
                const failed = emptySet(
                  f.code === "PROVIDER_UNAVAILABLE" ? "unavailable" : "failed",
                  { code: f.code, message: f.message, retryable: f.retryable },
                );
                if (set) failed.coverage = set.coverage;
                sets.set(author, failed);
              }
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
        outcome = {
          results,
          caches,
          snapshots: [...snapshots].map(([key, raw]) => ({ key, raw })),
        };
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
