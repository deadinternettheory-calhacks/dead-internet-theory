import { nativeString, type Person, type RecordItem } from "./graph";
import type { Model } from "./core";

// Clearpath's flat post/comment rows use _type and retain Reddit-native fields.
// These mappings never infer profile attributes or retrieve linked media.
export function redditRowType(row: any): unknown {
  return row._type ?? row.type;
}
function observedNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
function redditMetrics(row: any): Model<"Engagement"> {
  const result: Model<"Engagement"> = {};
  if (
    !row.isScoreHidden &&
    !row.score_hidden &&
    !row.hide_score &&
    observedNumber(row.score)
  )
    result.score = row.score;
  const replyCount =
    row.replyCount ??
    (redditRowType(row) === "post"
      ? (row.commentCount ?? row.num_comments)
      : row.childCount);
  if (observedNumber(replyCount)) result.replyCount = replyCount;
  const ratio = row.upvoteRatio ?? row.upvote_ratio;
  if (observedNumber(ratio)) result.upvoteRatio = ratio;
  return result;
}
function redditAuthor(row: any): Person | null {
  const nested = row.author && typeof row.author === "object" ? row.author : {};
  const nativeId = nativeString(
    row.authorId ?? row.author_fullname ?? nested.id,
  );
  const handle =
    typeof row.author === "string"
      ? row.author
      : typeof row.authorName === "string"
        ? row.authorName
        : typeof nested.username === "string"
          ? nested.username
          : null;
  if (!nativeId && !handle) return null;
  return {
    nativeId,
    handle,
    displayName:
      typeof row.authorDisplayName === "string" ? row.authorDisplayName : null,
  };
}
export function redditSourceUrl(row: any): string | null {
  const candidate = typeof row.permalink === "string" ? row.permalink : row.url;
  if (
    typeof candidate !== "string" ||
    candidate.startsWith("//") ||
    /[\\\x00-\x20]/.test(candidate)
  )
    return null;
  try {
    const url = candidate.startsWith("/")
      ? new URL(candidate, "https://www.reddit.com")
      : new URL(candidate);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !["reddit.com", "www.reddit.com", "old.reddit.com"].includes(url.hostname)
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}
export function redditRecord(row: any): RecordItem {
  const parent = nativeString(row.parentId ?? row.parent_id);
  const isComment = redditRowType(row) === "comment";
  const rawTime =
    typeof row.createdAt === "string" && row.createdAt
      ? row.createdAt
      : (row.created_utc ?? null);
  const text = row.text ?? row.body ?? row.comment;
  return {
    nativeId: nativeString(row.id ?? row.commentId ?? row.name),
    text: typeof text === "string" ? text : "",
    author: redditAuthor(row),
    parentNativeId: parent,
    topLevel:
      row.depth === 0 ||
      row.isTopLevel === true ||
      (isComment && parent === null && row.depth == null),
    timestamp:
      typeof rawTime === "string" || typeof rawTime === "number"
        ? rawTime
        : null,
    estimated:
      row.timestampPrecision === "estimated" ||
      row.isTimestampEstimated === true,
    url: redditSourceUrl(row),
    metrics: redditMetrics(row),
    contentStatus:
      row.isRemoved || row.removed || text === "[removed]"
        ? "removed"
        : row.isDeleted || row.deleted || text === "[deleted]"
          ? "deleted"
          : typeof text === "string"
            ? "visible"
            : "unknown",
  };
}
