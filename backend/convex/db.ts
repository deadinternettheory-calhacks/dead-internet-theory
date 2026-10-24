import type {
  GenericMutationCtx,
  DataModelFromSchemaDefinition,
} from "convex/server";
import type schema from "./schema";
export const RETENTION_MS = 24 * 60 * 60 * 1000;
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
  | "controls"
  | "providerSlots";
export async function get(ctx: Ctx, table: Table, key: string) {
  const doc = await ctx.db
    .query(table)
    .withIndex("key", (q) => q.eq("key", key))
    .unique();
  return doc && (doc.expiresAt === undefined || doc.expiresAt > Date.now())
    ? doc.data
    : undefined;
}
export async function deadline(
  ctx: Ctx,
  table: Table,
  key: string,
): Promise<number | undefined> {
  return (
    await ctx.db
      .query(table)
      .withIndex("key", (q) => q.eq("key", key))
      .unique()
  )?.expiresAt;
}
async function parentDeadline(ctx: Ctx, table: Table, key: string, data: any) {
  let investigation = data.investigationId ?? data.resource?.investigationId;
  if (table === "graphs" || table === "analyses") investigation = key;
  if (table === "jobs") {
    if (["ingest", "event"].includes(data.kind)) investigation = data.target;
    if (data.kind === "enrich")
      investigation = (await get(ctx, "enrichments", data.target))?.resource
        .investigationId;
  }
  return typeof investigation === "string" && table !== "investigations"
    ? deadline(ctx, "investigations", investigation)
    : undefined;
}
export async function put(ctx: Ctx, table: Table, key: string, data: any) {
  const doc = await ctx.db
    .query(table)
    .withIndex("key", (q) => q.eq("key", key))
    .unique();
  const reusable = table === "cache" || table === "idempotency";
  const existingExpiry =
    table === "cache" ||
    (reusable && (doc?.expiresAt ?? Infinity) <= Date.now())
      ? undefined
      : doc?.expiresAt;
  const expiresAt =
    existingExpiry ??
    (table === "providerSlots" && data.status === "active"
      ? undefined
      : ((await parentDeadline(ctx, table, key, data)) ??
        Math.min(
          Date.now() + RETENTION_MS,
          table === "cache" ? data.expires : Infinity,
        )));
  const value =
    table === "jobs"
      ? {
          key,
          data,
          status: data.status,
          due: data.status === "running" ? (data.lease ?? data.due) : data.due,
        }
      : table === "providerSlots"
        ? { key, data, status: data.status }
        : { key, data };
  if (doc) await ctx.db.patch(doc._id, { ...value, expiresAt });
  else await ctx.db.insert(table, { ...value, expiresAt } as never);
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
