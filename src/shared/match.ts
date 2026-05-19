import type { ProfileRow } from "./types";

export function profileMatchesUrl(profile: ProfileRow, url: string): boolean {
  return profile.enabled && profile.matchPatterns.some((pattern) => matchPattern(pattern, url));
}

export function matchPattern(pattern: string, url: string): boolean {
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`).test(url);
}

export function patternForUrl(url: string, scope: "page" | "path" | "domain"): string {
  const parsed = new URL(url);
  if (scope === "page") return parsed.href;
  if (scope === "path") return `${parsed.origin}${parsed.pathname.replace(/\/?$/, "")}*`;
  return `${parsed.origin}/*`;
}
