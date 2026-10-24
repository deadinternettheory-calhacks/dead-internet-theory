import { ApiFault, type Platform } from "./core";
// No direct requests to submitted URLs: all content comes from fixed provider APIs.
// Short links are deliberately excluded; there is no user-controlled redirect resolver.
export function source(raw: string): {
  url: string;
  platform: Platform;
  nativeId: string;
} {
  const bad = () => {
    throw new ApiFault(
      400,
      "INVALID_URL",
      "Use a supported HTTPS public discussion URL without credentials, ports or encodings",
    );
  };
  if (
    raw !== raw.trim() ||
    /[\\\s\x00-\x1f%]/.test(raw) ||
    !raw.startsWith("https://")
  )
    return bad();
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return bad();
  }
  const authority = raw.slice(8).split(/[/?#]/)[0];
  if (
    u.username ||
    u.password ||
    authority.includes(":") ||
    u.hostname.endsWith(".")
  )
    return bad();
  const h = u.hostname.toLowerCase();
  let platform: Platform;
  let id: string | undefined;
  if (["reddit.com", "www.reddit.com", "old.reddit.com"].includes(h)) {
    platform = "reddit";
    id = u.pathname.match(
      /^\/r\/[A-Za-z0-9_]+\/comments\/([A-Za-z0-9]+)(?:\/[^/]*)?\/?$/,
    )?.[1];
    if (id) u.pathname = `/r/${u.pathname.split("/")[2]}/comments/${id}/`;
    u.hostname = "www.reddit.com";
  } else if (
    ["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(h)
  ) {
    platform = "x";
    id = u.pathname.match(/^\/[A-Za-z0-9_]+\/status\/(\d+)\/?$/)?.[1];
    u.hostname = "x.com";
  } else if (["youtube.com", "www.youtube.com", "youtu.be"].includes(h)) {
    platform = "youtube";
    id =
      h === "youtu.be"
        ? u.pathname.match(/^\/([A-Za-z0-9_-]{11})\/?$/)?.[1]
        : u.pathname === "/watch"
          ? (u.searchParams.get("v") ?? undefined)
          : u.pathname.match(/^\/shorts\/([A-Za-z0-9_-]{11})\/?$/)?.[1];
    if (id && !/^[A-Za-z0-9_-]{11}$/.test(id)) return bad();
    u.hostname = "www.youtube.com";
    u.pathname = "/watch";
  } else if (["tiktok.com", "www.tiktok.com"].includes(h)) {
    platform = "tiktok";
    id = u.pathname.match(/^\/@[A-Za-z0-9_.]+\/video\/(\d+)\/?$/)?.[1];
    u.hostname = "www.tiktok.com";
  } else return bad();
  if (!id) return bad();
  u.search = "";
  u.hash = "";
  if (platform === "youtube") u.searchParams.set("v", id);
  return { url: u.href, platform, nativeId: id };
}
