import type { Platform } from "./generated/models";
// Comparison aliases only: preserve provider-native IDs unchanged in wire data.
export function nativeKey(
  platform: Platform,
  kind: "discussion" | "comment",
  id: string,
): string {
  if (platform !== "reddit") return id;
  return id.replace(kind === "discussion" ? /^t3_/ : /^t1_/, "");
}
export function sameNative(
  platform: Platform,
  kind: "discussion" | "comment",
  a: string | null,
  b: string | null,
): boolean {
  return (
    a !== null &&
    b !== null &&
    nativeKey(platform, kind, a) === nativeKey(platform, kind, b)
  );
}
