"use node";
import { internalActionGeneric as action, anyApi } from "convex/server";
import { inspectForDeletion, deleteProviderRun } from "../src/provider-cleanup";
export const sweep = action({
  args: {},
  handler: async (ctx) => {
    const token = process.env.APIFY_TOKEN;
    if (!token) return;
    const rows = await ctx.runMutation(anyApi.retention.claimProvider, {});
    for (const row of rows) {
      try {
        const observation = await inspectForDeletion(row.key, token);
        const resources = { ...observation.resources, ...row.resources };
        await ctx.runMutation(anyApi.retention.finishProvider, {
          key: row.key,
          resources,
          done: false,
        });
        if (!observation.terminal) continue;
        await deleteProviderRun(row.key, resources, token);
        await ctx.runMutation(anyApi.retention.finishProvider, {
          key: row.key,
          done: true,
        });
      } catch {
        // The durable non-content run record remains for the next attempt.
        console.error("Provider retention cleanup will retry");
      }
    }
  },
});
