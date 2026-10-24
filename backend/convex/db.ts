import type {
  GenericMutationCtx,
  DataModelFromSchemaDefinition,
} from "convex/server";
import type schema from "./schema";
export type Ctx = GenericMutationCtx<
  DataModelFromSchemaDefinition<typeof schema>
>;
export type Table =
  | "investigations"
  | "graphs"
  | "enrichments"
  | "analyses"
  | "idempotency"
  | "jobs"
  | "snapshots"
  | "cache"
  | "controls";
export async function get(ctx: Ctx, table: Table, key: string) {
  return (
    await ctx.db
      .query(table)
      .withIndex("key", (q) => q.eq("key", key))
      .unique()
  )?.data;
}
export async function put(ctx: Ctx, table: Table, key: string, data: any) {
  const doc = await ctx.db
    .query(table)
    .withIndex("key", (q) => q.eq("key", key))
    .unique();
  const value =
    table === "jobs"
      ? {
          key,
          data,
          status: data.status,
          due: data.status === "running" ? (data.lease ?? data.due) : data.due,
        }
      : { key, data };
  if (doc) await ctx.db.patch(doc._id, value);
  else await ctx.db.insert(table, value as never);
}
export async function immutable(
  ctx: Ctx,
  table: "graphs" | "analyses",
  key: string,
  data: any,
) {
  if (await get(ctx, table, key))
    throw new Error("Immutable record already exists");
  await put(ctx, table, key, data);
}
