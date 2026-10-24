// Candidate adapters: parsing tests prove only these synthetic input mappings.
// Live enablement requires reviewed runtime evidence and authorization, not a token alone.
import {
  ApiFault,
  iso,
  limits,
  type Model,
  type Platform,
  stable,
} from "./core";
import {
  nativeString,
  type DiscussionData,
  type RecordItem,
  type Person,
  timestamp,
} from "./graph";
import type { CandidateSet } from "./history";
import { outbound } from "./outbound";
import { sameNative } from "./identity";
import { source } from "./url";
import { verification } from "./provider-policy";
export { verification } from "./provider-policy";
export const actors = {
  reddit: "clearpath/reddit-post-comments-bulk-scraper",
  redditHistory: "clearpath/reddit-user-content-scraper",
  x: "apidojo/twitter-replies-scraper",
  xHistory: "apidojo/tweet-scraper",
  youtube: "datagleaner/youtube-comments-scraper",
  tiktok: "deepmine/tiktok-comments-scraper",
};
export function liveGate(platform: Platform) {
  if (
    process.env.PROVIDER_MODE !== "live" ||
    process.env.PROVIDER_AUTHORIZATION_APPROVED !== "true" ||
    !process.env.RETENTION_POLICY_REF?.trim()
  )
    throw new ApiFault(
      500,
      "PROVIDER_NOT_AUTHORIZED",
      "Live provider authorization and retention prerequisites are not configured",
    );
  if (
    !verification[platform].runtimeVerified ||
    !verification[platform].evidence?.trim()
  )
    throw new ApiFault(
      500,
      "PROVIDER_NOT_VERIFIED",
      "Candidate adapter has no reviewed authorized runtime evidence",
    );
  if (!process.env.APIFY_TOKEN?.trim())
    throw new ApiFault(
      500,
      "PROVIDER_NOT_CONFIGURED",
      "Apify server credential is not configured",
    );
}
interface Task {
  authorIds?: string[];
  actor: string;
  input: unknown;
  role: "root" | "discussion" | "history";
  run?: any;
  rows: any[];
  offset: number;
  done: boolean;
  truncated: boolean;
}
export interface PlanState {
  tasks?: Task[];
  index?: number;
  began?: number;
}
export function plan(
  platform: Platform,
  kind: "discussion" | "history",
  url?: string,
  authors: Model<"AuthorNode">[] = [],
): Task[] {
  const task = (actor: string, input: unknown, role: Task["role"]): Task => ({
    actor,
    input,
    role,
    rows: [],
    offset: 0,
    done: false,
    truncated: false,
  });
  if (kind === "history") {
    if (!["reddit", "x"].includes(platform)) return [];
    const handles = authors.map((a) => a.handle);
    if (handles.some((h) => !h || !/^[A-Za-z0-9_-]+$/.test(h)))
      throw new ApiFault(
        500,
        "PROVIDER_UNAVAILABLE",
        "Author does not have a supported provider lookup handle",
      );
    if (platform === "reddit")
      return [
        {
          ...task(
            actors.redditHistory,
            {
              usernames: handles,
              contentType: "comments",
              sort: "new",
              maxItemsPerUser: 150,
            },
            "history",
          ),
          authorIds: authors.map((a) => a.id),
        },
      ];
    // Authored search, never replies TO a profile. Date filtering is deliberately
    // omitted here so fallback can use recent content outside an anchor window.
    return handles.map((h, index) => ({
      ...task(
        actors.xHistory,
        { searchTerms: [`from:${h}`], sort: "Latest", maxItems: 150 },
        "history",
      ),
      authorIds: [authors[index].id],
    }));
  }
  if (platform === "reddit")
    return [
      task(
        actors.reddit,
        {
          postUrl: url,
          maxCommentsPerPost: limits().comments,
          expandAllComments: true,
          sort: "new",
        },
        "discussion",
      ),
    ];
  if (platform === "x")
    return [
      task(actors.xHistory, { startUrls: [url], maxItems: 1 }, "root"),
      task(
        actors.x,
        { startUrls: [url], maxItems: limits().comments, useSearch: false },
        "discussion",
      ),
    ];
  if (platform === "youtube")
    return [
      task(
        actors.youtube,
        {
          videoUrls: [url],
          sortBy: "newest",
          includeReplies: true,
          maxCommentsPerVideo: limits().comments,
          maxRepliesPerComment: 50,
        },
        "discussion",
      ),
    ];
  return [
    task(
      actors.tiktok,
      {
        videos: [url],
        includeReplies: true,
        maxCommentsPerVideo: limits().comments,
        maxRepliesPerComment: 50,
      },
      "discussion",
    ),
  ];
}
export class Apify {
  constructor(
    private token = process.env.APIFY_TOKEN,
    private request = outbound,
  ) {}
  async api(path: string, method = "GET", body?: unknown): Promise<any> {
    if (!this.token)
      throw new ApiFault(
        500,
        "PROVIDER_NOT_CONFIGURED",
        "Apify server credential is not configured",
      );
    const response = await this.request(`https://api.apify.com/v2/${path}`, {
      method,
      body,
      headers: { authorization: `Bearer ${this.token}` },
    });
    if (response.status < 200 || response.status >= 300)
      throw new ApiFault(
        500,
        response.status === 403 || response.status === 404
          ? "PROVIDER_UNAVAILABLE"
          : "PROVIDER_FAILED",
        "Apify request failed",
        response.status === 429 || response.status >= 500,
      );
    return response.body;
  }
  async start(actor: string, input: unknown) {
    const response = await this.api(
      `acts/${encodeURIComponent(actor.replace("/", "~"))}/runs?waitForFinish=0&timeout=${limits().runSeconds}&memory=256&maxTotalChargeUsd=${limits().cents / 100}`,
      "POST",
      input,
    );
    return response.data;
  }
  async poll(id: string) {
    return (await this.api(`actor-runs/${encodeURIComponent(id)}`)).data;
  }
  async items(dataset: string, offset: number, limit: number) {
    const result = await this.api(
      `datasets/${encodeURIComponent(dataset)}/items?format=json&clean=false&offset=${offset}&limit=${limit}`,
    );
    if (!Array.isArray(result))
      throw new ApiFault(
        500,
        "PROVIDER_INVALID_DATA",
        "Expected a dataset array",
      );
    return result;
  }
}
export type RunAdmission =
  | { status: "reserved" }
  | { status: "resume"; runId: string }
  | { status: "busy" }
  | { status: "denied"; reason: string };
export async function advance(args: {
  platform: Platform;
  kind: "discussion" | "history";
  url?: string;
  authors?: Model<"AuthorNode">[];
  state: PlanState;
  reserve: (op: string) => Promise<RunAdmission>;
  observe: (op: string, runId: string, status: string) => Promise<boolean>;
}) {
  liveGate(args.platform);
  const state: Required<PlanState> = {
    tasks:
      args.state.tasks ??
      plan(args.platform, args.kind, args.url, args.authors),
    index: args.state.index ?? 0,
    began: args.state.began ?? Date.now(),
  };
  const provider = new Apify();
  const task = state.tasks[state.index];
  if (
    Date.now() - state.began >
    (limits().runSeconds + 90) * 1000 * state.tasks.length
  )
    throw new ApiFault(
      500,
      "PROVIDER_TIMEOUT",
      "Provider workflow exceeded execution budget",
    );
  const operation = `run:${state.index}`;
  async function observed(run: any) {
    if (
      !run ||
      typeof run.id !== "string" ||
      !run.id ||
      typeof run.status !== "string" ||
      !run.status
    )
      throw new ApiFault(
        500,
        "PROVIDER_INVALID_DATA",
        "Provider run metadata is invalid",
      );
    if (!(await args.observe(operation, run.id, run.status)))
      throw new ApiFault(
        500,
        "JOB_LEASE_LOST",
        "Job no longer holds the execution lease",
      );
    return run;
  }
  if (task && !task.run) {
    const admission = await args.reserve(operation);
    if (admission.status === "busy") return { done: false as const, state };
    if (admission.status === "denied")
      throw new ApiFault(
        500,
        admission.reason === "ambiguous"
          ? "PROVIDER_START_AMBIGUOUS"
          : "PROVIDER_BUDGET_LIMIT",
        "Provider admission denied; inspect execution capacity and reserved budget",
      );
    if (admission.status === "resume")
      task.run = await observed(await provider.poll(admission.runId));
    else {
      let run;
      try {
        run = await provider.start(task.actor, task.input);
      } catch {
        throw new ApiFault(
          500,
          "PROVIDER_START_AMBIGUOUS",
          "Provider start was not confirmed; reserved budget and capacity are retained",
        );
      }
      task.run = await observed(run);
    }
  } else if (task && !task.done) {
    if (
      !["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(task.run.status)
    )
      task.run = await observed(await provider.poll(task.run.id));
    else {
      const budget =
        args.kind === "history"
          ? 150 * (task.authorIds?.length ?? args.authors?.length ?? 1)
          : task.role === "root"
            ? 1
            : limits().comments + 1;
      const pageLimit = Math.min(100, budget - task.offset);
      const rows = await provider.items(
        task.run.defaultDatasetId,
        task.offset,
        pageLimit,
      );
      if (rows.length > pageLimit)
        throw new ApiFault(
          500,
          "PROVIDER_INVALID_DATA",
          "Provider exceeded the requested dataset page limit",
        );
      task.rows.push(...rows);
      task.offset += rows.length;
      if (new TextEncoder().encode(stable(state)).length > 650_000)
        throw new ApiFault(
          500,
          "PROVIDER_SIZE_LIMIT",
          "Raw dataset exceeds configured snapshot budget",
        );
      if (rows.length < pageLimit || task.offset >= budget) {
        task.done = true;
        task.truncated = task.role !== "root" && task.offset >= budget;
        state.index++;
      }
    }
  }
  if (state.index < state.tasks.length) return { done: false as const, state };
  const raw = state.tasks;
  return {
    done: true as const,
    raw,
    discussion:
      args.kind === "discussion"
        ? discussion(args.platform, args.url!, raw)
        : undefined,
  };
}
const obj = (x: unknown): any => (x && typeof x === "object" ? x : {});
const text = (x: unknown) => (typeof x === "string" ? x : "");
function metrics(row: any): Model<"Engagement"> {
  const result: Model<"Engagement"> = {};
  for (const k of [
    "score",
    "likeCount",
    "replyCount",
    "repostCount",
    "viewCount",
    "shareCount",
    "upvoteRatio",
  ])
    if (typeof row[k] === "number" && Number.isFinite(row[k]))
      result[k] = row[k];
  return result;
}
function person(row: any, p: Platform): Person | null {
  const a = obj(row.author);
  const id = nativeString(
    row.authorId ??
      (p === "youtube"
        ? row.authorChannelId
        : p === "tiktok"
          ? row.commenterId
          : a.id),
  );
  const handle = text(
    row.authorName ??
      (typeof row.author === "string"
        ? row.author
        : (a.userName ?? a.username ?? row.username)),
  );
  if (!id && !handle) return null;
  return {
    nativeId: id,
    handle: handle || null,
    displayName: text(a.name ?? row.authorDisplayName) || null,
  };
}
export function mapRecord(p: Platform, row: any): RecordItem {
  const rawTime =
    row.createdAt ?? row.publishedAt ?? row.postedAt ?? row.created_utc ?? null;
  const nativeId = nativeString(row.commentId ?? row.id);
  const parent = nativeString(
    p === "x"
      ? row.inReplyToId
      : p === "tiktok"
        ? (row.replyToCommentId ?? row.parentCommentId)
        : row.parentId,
  );
  return {
    nativeId,
    text: text(row.text ?? row.body ?? row.comment),
    author: person(row, p),
    parentNativeId: parent,
    topLevel: row.depth === 0 || row.isTopLevel === true,
    timestamp: rawTime,
    estimated:
      row.timestampPrecision === "estimated" ||
      row.isTimestampEstimated === true ||
      (p === "youtube" && row.timestampPrecision !== "exact"),
    url:
      typeof (row.url ?? row.permalink) === "string" &&
      String(row.url ?? row.permalink).startsWith("https://")
        ? (row.url ?? row.permalink)
        : null,
    metrics: metrics(row),
    contentStatus: row.deleted
      ? "deleted"
      : row.removed
        ? "removed"
        : typeof (row.text ?? row.body ?? row.comment) === "string"
          ? "visible"
          : "unknown",
  };
}
export function discussion(
  p: Platform,
  url: string,
  tasks: Task[],
): DiscussionData {
  const all = tasks.flatMap((t) => t.rows);
  // Fail closed if original root is missing. Replies are never promoted to root.
  const root =
    tasks.find((t) => t.role === "root")?.rows[0] ??
    all.find(
      (r) => r.type === "post" || r.type === "video" || r.type === "discussion",
    );
  if (!root)
    throw new ApiFault(
      500,
      "PROVIDER_INVALID_DATA",
      "Dataset lacks a verified original discussion root",
    );
  const r = mapRecord(p, root);
  const native = nativeString(root.id ?? root.videoId);
  if (!native)
    throw new ApiFault(
      500,
      "PROVIDER_INVALID_DATA",
      "Original discussion has no native ID",
    );
  if (!sameNative(p, "discussion", native, source(url).nativeId))
    throw new ApiFault(
      500,
      "PROVIDER_INVALID_DATA",
      "Original discussion identity does not match the requested source",
    );
  r.text = text(
    root.text ??
      root.body ??
      root.selftext ??
      root.fullText ??
      root.caption ??
      root.description,
  );
  const comments = tasks
    .filter((t) => t.role !== "root")
    .flatMap((t) => t.rows)
    .filter(
      (r) =>
        r !== root &&
        !(p === "x" && nativeString(r.id ?? r.commentId) === native) &&
        r.type !== "post" &&
        r.type !== "video" &&
        r.type !== "discussion",
    )
    .map((r) => mapRecord(p, r));
  // Reddit candidate contract documents null top-level parents. Do not apply this
  // rule to platforms where a missing parent is ambiguous.
  if (p === "reddit")
    for (const c of comments) if (c.parentNativeId === null) c.topLevel = true;
  const limited = tasks.some(
    (t) => t.truncated || t.run?.status !== "SUCCEEDED",
  );
  const reported =
    typeof root.commentCount === "number" &&
    Number.isSafeInteger(root.commentCount) &&
    root.commentCount >= 0
      ? root.commentCount
      : null;
  return {
    root: {
      ...r,
      nativeId: native,
      title: typeof root.title === "string" ? root.title : null,
    },
    comments,
    reportedCount: reported,
    truncated: limited ? true : null,
    exhaustive: false,
    limitations: [
      "Third-party provider results are best effort; successful execution is not proof of exhaustive retrieval.",
      ...(p === "youtube"
        ? [
            "Video metadata and estimated comment dates only; no audiovisual analysis.",
          ]
        : []),
    ],
    sortOrder: "new",
    collectedAt: iso(),
    sourceSnapshotRef: "pending",
    actorRuns: tasks.map((t) => ({
      actorId: t.actor,
      runId: t.run.id,
      datasetId: t.run.defaultDatasetId,
      status: t.run.status,
      startedAt: timestamp(t.run.startedAt).createdAt,
      completedAt: timestamp(t.run.finishedAt).createdAt,
    })),
  };
}
export function historySets(
  p: Platform,
  authors: string[],
  raw: Task[],
  snapshot: string,
): Map<string, CandidateSet> {
  const result = new Map<string, CandidateSet>();
  for (const authorId of authors) {
    const tasks = raw.filter(
      (t) => !t.authorIds || t.authorIds.includes(authorId),
    );
    const rows = tasks
      .flatMap((t) => t.rows)
      .filter((row) => {
        if (p === "x" && !row.inReplyToId && row.isReply !== true) return false;
        const a = person(row, p);
        return a?.nativeId
          ? authorId === `${p}:author:${a.nativeId}`
          : a?.handle
            ? authorId === `${p}:author:handle:${a.handle}`
            : false;
      })
      .slice(0, 150);
    const comments = rows.map((row) => {
      const c = mapRecord(p, row);
      return {
        id: `${p}:comment:${c.nativeId ?? "missing"}`,
        nativeId: c.nativeId,
        authorId,
        text: c.text,
        ...timestamp(c.timestamp, c.estimated),
        url: c.url ?? null,
        sourceDiscussionNativeId: nativeString(
          row.sourceDiscussionNativeId ?? row.postId ?? row.conversationId,
        ),
        metrics: c.metrics ?? {},
      };
    });
    const times = comments
      .map((c) => c.createdAt)
      .filter((t): t is string => !!t)
      .sort();
    const failed =
      tasks.length === 0 || tasks.every((t) => t.run?.status !== "SUCCEEDED");
    result.set(authorId, {
      comments,
      ...(failed
        ? {
            status: "failed" as const,
            error: {
              code: "PROVIDER_FAILED",
              message: "History Actor did not succeed",
              retryable: true,
            },
          }
        : {}),
      coverage: {
        candidateFetchedCount: rows.length,
        providerTruncated: tasks.some((t) => t.truncated) ? true : null,
        oldestFetchedAt: times[0] ?? null,
        newestFetchedAt: times.at(-1) ?? null,
        collectedAt: iso(),
        sourceSnapshotRef: snapshot,
        actorRunIds: tasks
          .filter((t) => typeof t.run?.id === "string")
          .map((t) => t.run.id),
        limitations: [
          "Best-effort authored candidates, capped at 150; not a lifetime-history census.",
        ],
      },
    });
  }
  return result;
}
