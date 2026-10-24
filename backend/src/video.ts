import { ApiFault, type Platform } from "./core";
import { nativeString } from "./graph";

/** Construct only the original video's observed metadata, never a comment's text or author. */
export function videoMetadataRoot(
  platform: Platform,
  expectedId: string,
  rows: any[],
) {
  if (platform !== "youtube" && platform !== "tiktok") return undefined;
  const identified = rows.filter((row) => row.videoId != null);
  if (identified.some((row) => nativeString(row.videoId) !== expectedId))
    throw new ApiFault(
      500,
      "PROVIDER_INVALID_DATA",
      "Provider returned comments for a different video",
    );
  if (!identified.length) return undefined;
  const title = identified.find(
    (row) => typeof row.videoTitle === "string" && row.videoTitle.trim(),
  )?.videoTitle;
  const caption = identified.find(
    (row) => typeof row.videoCaption === "string" && row.videoCaption.trim(),
  )?.videoCaption;
  const count = identified.find(
    (row) =>
      Number.isSafeInteger(row.videoCommentCount) && row.videoCommentCount >= 0,
  )?.videoCommentCount;
  return {
    type: "video",
    id: expectedId,
    text: platform === "youtube" ? (title ?? "") : (caption ?? ""),
    title: title ?? null,
    commentCount: count,
    author: null,
    createdAt: null,
  };
}

/** Drop unused profile, image, media and tracking fields before persisting provider state. */
export function slimSocialRow(row: any): any {
  const fields = [
    "type",
    "id",
    "commentId",
    "text",
    "body",
    "comment",
    "fullText",
    "createdAt",
    "publishedAt",
    "postedAt",
    "postedAtTimestamp",
    "timestampPrecision",
    "isTimestampEstimated",
    "publishedApprox",
    "url",
    "permalink",
    "commentUrl",
    "inReplyToId",
    "conversationId",
    "parentId",
    "parentCommentId",
    "replyToCommentId",
    "isReply",
    "isTopLevel",
    "depth",
    "deleted",
    "removed",
    "score",
    "likeCount",
    "likes",
    "replyCount",
    "replies",
    "retweetCount",
    "repostCount",
    "viewCount",
    "shareCount",
    "authorId",
    "authorName",
    "authorHandle",
    "authorChannelId",
    "authorDisplayName",
    "username",
    "commenterId",
    "commenterUsername",
    "commenterName",
    "videoId",
    "videoUrl",
    "videoTitle",
    "videoCaption",
    "videoCommentCount",
    "inputUrl",
    "sortBy",
  ];
  const slim: Record<string, unknown> = {};
  for (const field of fields)
    if (row[field] !== undefined) slim[field] = row[field];
  if (typeof row.author === "string") slim.author = row.author;
  else if (row.author && typeof row.author === "object")
    slim.author = Object.fromEntries(
      ["id", "userName", "username", "name"]
        .filter((key) => row.author[key] !== undefined)
        .map((key) => [key, row.author[key]]),
    );
  return slim;
}
