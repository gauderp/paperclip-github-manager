import type { PluginContext } from "@paperclipai/plugin-sdk";
import { resolveGithubToken, getGithubApiBase } from "./config.js";

export type GitHubFetchOptions = {
  method?: string;
  body?: unknown;
  accept?: string;
};

export type RateLimitInfo = {
  remaining: number;
  limit: number;
  resetAt: string;
};

export async function githubFetch(
  ctx: PluginContext,
  companyId: string,
  path: string,
  options: GitHubFetchOptions = {},
): Promise<{ data: unknown; rateLimit: RateLimitInfo }> {
  const token = await resolveGithubToken(ctx, companyId);
  const base = getGithubApiBase();
  const url = path.startsWith("http") ? path : `${base}${path}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: options.accept ?? "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  const resp = await ctx.http.fetch(url, {
    method: options.method ?? "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const rateLimit: RateLimitInfo = {
    remaining: Number(resp.headers?.["x-ratelimit-remaining"] ?? 5000),
    limit: Number(resp.headers?.["x-ratelimit-limit"] ?? 5000),
    resetAt: new Date(
      Number(resp.headers?.["x-ratelimit-reset"] ?? 0) * 1000,
    ).toISOString(),
  };

  if (!resp.ok) {
    const body = typeof resp.body === "string" ? resp.body : JSON.stringify(resp.body);
    if (resp.status === 403 && rateLimit.remaining === 0) {
      throw new Error(`GitHub rate limit exceeded. Resets at ${rateLimit.resetAt}`);
    }
    throw new Error(`GitHub API ${resp.status}: ${body}`);
  }

  return { data: resp.body, rateLimit };
}

export function isRateLimitSafe(rateLimit: RateLimitInfo, threshold = 100): boolean {
  return rateLimit.remaining > threshold;
}
