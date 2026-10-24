// Fixed provider identities and reviewed builds; source URLs never choose an Actor.
export const actors = {
  reddit: "clearpath/reddit-post-comments-bulk-scraper",
  redditHistory: "clearpath/reddit-user-content-scraper",
  x: "apidojo/twitter-replies-scraper",
  xRoot: "apidojo/twitter-scraper-lite",
  xHistory: "apidojo/twitter-scraper-lite",
  youtube: "datagleaner/youtube-comments-scraper",
  tiktok: "deepmine/tiktok-comments-scraper",
};

export const actorBuilds: Record<string, string> = {
  [actors.reddit]: "0.0.129",
  [actors.redditHistory]: "0.0.78",
  [actors.x]: "0.0.152",
  [actors.xRoot]: "0.0.1040",
  [actors.youtube]: "0.1.3",
  [actors.tiktok]: "0.7.20",
};

// Conservatively serialize X Actors for the provider's single-run policy.
export const serializedActorGroup: Record<string, string> = {
  [actors.xRoot]: "apidojo-x",
  [actors.x]: "apidojo-x",
};
