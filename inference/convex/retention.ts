import { internalMutation } from './_generated/server';
import { internal } from './_generated/api';
export const sweep = internalMutation({
  args: {},
  handler: async ctx => {
    const now = Date.now();
    const jobs = await ctx.db.query('jobs').withIndex('expiry', q => q.gte('expiresAt', 0).lte('expiresAt', now)).take(100);
    const cached = await ctx.db.query('modelCache').withIndex('expiry', q => q.lte('expiresAt', now)).take(100);
    for (const row of [...jobs, ...cached]) await ctx.db.delete(row._id);
    if (jobs.length === 100 || cached.length === 100) await ctx.scheduler.runAfter(0, internal.retention.sweep, {});
    return jobs.length + cached.length;
  },
});
