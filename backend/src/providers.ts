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
import { redditAuthor, redditRecord, redditRowType } from "./reddit";
import type { ProviderResources } from "./provider-cleanup";
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
  authorHandles?: Record<string, string>;
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
          authorHandles: Object.fromEntries(
            authors.map((a) => [a.id, a.handle!]),
          ),
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
/** An Apify API call that got an HTTP response; keeps the status for diagnosis. */
export class ApifyHttpError extends ApiFault {
  constructor(
    public httpStatus: number,
    code: string,
    message: string,
    retryable: boolean,
  ) {
    super(500, code, message, retryable);
  }
}
/**
 * Maps a failed start to a definite rejection when Apify answered with a 4xx
 * (the run was not created) or the request was never sent. Returns null when
 * the start may have been accepted (network error, timeout, 5xx).
 */
export function startRejection(e: unknown): ApiFault | null {
  if (e instanceof ApiFault && e.code === "PROVIDER_NOT_CONFIGURED") return e;
  if (
    !(e instanceof ApifyHttpError) ||
    e.httpStatus < 400 ||
    e.httpStatus >= 500
  )
    return null;
  const s = e.httpStatus;
  const message =
    s === 401
      ? "Apify rejected the server credential (HTTP 401); check APIFY_TOKEN"
      : s === 402
        ? "Apify refused to start the run (HTTP 402); the account is likely out of credit or over its usage limit"
        : s === 403 || s === 404
          ? `Apify refused access to the Actor or its pinned build (HTTP ${s})`
          : s === 429
            ? "Apify rate-limited the run start (HTTP 429)"
            : `Apify rejected the run start (HTTP ${s})`;
  return new ApiFault(500, "PROVIDER_REJECTED", message, s === 429);
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
      throw new ApifyHttpError(
        response.status,
        response.status === 403 || response.status === 404
          ? "PROVIDER_UNAVAILABLE"
          : "PROVIDER_FAILED",
        `Apify request failed (HTTP ${response.status})`,
        response.status === 429 || response.status >= 500,
      );
    return response.body;
  }
  async start(actor: string, input: unknown) {
    const build =
      actor === actors.reddit
        ? "0.0.129"
        : actor === actors.redditHistory
          ? "0.0.78"
          : null;
    const response = await this.api(
      `acts/${encodeURIComponent(actor.replace("/", "~"))}/runs?waitForFinish=0&timeout=${limits().runSeconds}&memory=256&maxTotalChargeUsd=${limits().cents / 100}${build ? `&build=${build}` : ""}`,
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
  /** Frees a reservation whose start Apify definitely refused. */
  release?: (op: string) => Promise<unknown>;
  observe: (
    op: string,
    runId: string,
    status: string,
    resources?: ProviderResources,
  ) => Promise<boolean>;
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
    const resources: ProviderResources = {};
    if (typeof run.defaultDatasetId === "string")
      resources.dataset = run.defaultDatasetId;
    if (typeof run.defaultKeyValueStoreId === "string")
      resources.keyValueStore = run.defaultKeyValueStoreId;
    if (typeof run.defaultRequestQueueId === "string")
      resources.requestQueue = run.defaultRequestQueueId;
    if (!(await args.observe(operation, run.id, run.status, resources)))
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
      } catch (e) {
        // A definite refusal frees the slot and reports why; anything else may
        // have started a billable run, so the slot is kept for an operator.
        const rejected = startRejection(e);
        if (rejected && args.release) {
          await args.release(operation);
          throw rejected;
        }
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
  if (p === "reddit") return redditRecord(row);
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
  const kind = (row: any) => (p === "reddit" ? redditRowType(row) : row.type);
  // Fail closed if original root is missing. Replies are never promoted to root.
  const root =
    tasks.find((t) => t.role === "root")?.rows[0] ??
    all.find(
      (r) =>
        kind(r) === "post" || kind(r) === "video" || kind(r) === "discussion",
    );
  if (!root)
    throw new ApiFault(
      500,
      "PROVIDER_INVALID_DATA",
      "Dataset lacks a verified original discussion root",
    );
  if (p === "reddit" && ["not_found", "unavailable"].includes(root._status))
    throw new ApiFault(
      500,
      "PROVIDER_UNAVAILABLE",
      "The permitted discussion was not available to the provider",
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
  if (
    p === "reddit" &&
    all.some(
      (row) =>
        kind(row) === "comment" &&
        row._post_id != null &&
        !sameNative("reddit", "discussion", nativeString(row._post_id), native),
    )
  )
    throw new ApiFault(
      500,
      "PROVIDER_INVALID_DATA",
      "Provider returned comments for a different discussion",
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
        kind(r) !== "post" &&
        kind(r) !== "video" &&
        kind(r) !== "discussion" &&
        (p !== "reddit" || kind(r) === "comment"),
    )
    .map((r) => mapRecord(p, r));

  const limited = tasks.some(
    (t) => t.truncated || t.run?.status !== "SUCCEEDED",
  );
  const reportedValue =
    root.commentCount ?? (p === "reddit" ? root.num_comments : undefined);
  const reported =
    typeof reportedValue === "number" &&
    Number.isSafeInteger(reportedValue) &&
    reportedValue >= 0
      ? reportedValue
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
      ...(p === "reddit" &&
      all.some((row) => row.isScoreHidden || row.score_hidden || row.hide_score)
        ? [
            "Provider-hidden scores are omitted rather than treated as observed values.",
          ]
        : []),
      ...(p === "reddit" &&
      (root.is_video === true ||
        root.post_hint === "image" ||
        root.post_hint === "rich:video")
        ? [
            "Linked image/video content is not collected or analyzed; only available title and text metadata are included.",
          ]
        : []),
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
    const ownRows = tasks.flatMap((task) =>
      task.rows.filter((row) => {
        const a = p === "reddit" ? redditAuthor(row) : person(row, p);
        // An observed native identity takes precedence over a matching handle.
        if (a?.nativeId) return authorId === `${p}:author:${a.nativeId}`;
        const handle = a?.handle ?? (p === "reddit" ? row._username : null);
        if (typeof handle !== "string") return false;
        const requestedHandle = task.authorHandles?.[authorId];
        return p === "reddit" && requestedHandle
          ? handle.toLowerCase() === requestedHandle.toLowerCase()
          : authorId === `${p}:author:handle:${handle}`;
      }),
    );
    const rows = ownRows
      .filter((row) =>
        p === "reddit"
          ? // Older persisted plans can contain untyped comment rows.
            (redditRowType(row) == null || redditRowType(row) === "comment") &&
            (row._status == null || row._status === "found")
          : p !== "x" || row.inReplyToId || row.isReply === true,
      )
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
          row.sourceDiscussionNativeId ??
            (p === "reddit"
              ? (row.link_id ?? row.postId)
              : (row.postId ?? row.conversationId)),
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
    const unavailable =
      p === "reddit" &&
      !rows.length &&
      ownRows.some((r) =>
        ["not_found", "suspended", "unavailable"].includes(r._status),
      );
    result.set(authorId, {
      comments,
      ...(unavailable
        ? {
            status: "unavailable" as const,
            error: {
              code: "PROVIDER_UNAVAILABLE",
              message: "Provider reported this author's content unavailable",
              retryable: ownRows.some((r) => r._status === "unavailable"),
            },
          }
        : failed
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
        providerTruncated:
          rows.length >= 150 ||
          tasks.some((t) => t.truncated || t.done === false)
            ? true
            : null,
        oldestFetchedAt: times[0] ?? null,
        newestFetchedAt: times.at(-1) ?? null,
        collectedAt: iso(),
        sourceSnapshotRef: snapshot,
        actorRunIds: tasks
          .filter((t) => typeof t.run?.id === "string")
          .map((t) => t.run.id),
        limitations: [
          "Best-effort authored candidates, capped at 150; not a lifetime-history census.",
          ...(p === "reddit" && !ownRows.length && !failed
            ? [
                "Provider returned no rows identifying this requested author; availability and lifetime history are unknown.",
              ]
            : []),
        ],
      },
    });
  }
  return result;
}
