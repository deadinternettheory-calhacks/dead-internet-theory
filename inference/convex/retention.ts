import { internalMutation } from './_generated/server';
import { internal } from './_generated/api';
export const sweep = internalMutation({
  args: {},
  handler: async ctx => {
    const rows = await ctx.db.query('jobs').withIndex('expiry', q => q.gte('expiresAt', 0).lte('expiresAt', Date.now())).take(100);
    for (const row of rows) await ctx.db.delete(row._id);
    if (rows.length === 100) await ctx.scheduler.runAfter(0, internal.retention.sweep, {});
    return rows.length;
  },
});
