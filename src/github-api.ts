import type { PluginContext } from "@paperclipai/plugin-sdk";

export const GITHUB_API = "https://api.github.com";
export const GITHUB_WEBHOOK_ENDPOINT = "github-events";

export type GitHubFetchContext = Pick<PluginContext, "http" | "logger">;

export async function githubFetch(
  ctx: GitHubFetchContext,
  token: string,
  path: string,
  init?: RequestInit
): Promise<Response> {
  const url = path.startsWith("http") ? path : `${GITHUB_API}${path}`;
  return ctx.http.fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init?.headers ?? {})
    }
  });
}

export function parseRepoFullName(fullName: string): { owner: string; repo: string } {
  const [owner, repo] = fullName.split("/");
  if (!owner || !repo) {
    throw new Error(`Invalid repository full name: ${fullName}`);
  }
  return { owner, repo };
}

export function buildInboundWebhookUrl(pluginId: string, baseUrl = "http://127.0.0.1:3100"): string {
  return `${baseUrl.replace(/\/+$/, "")}/api/plugins/${pluginId}/webhooks/${GITHUB_WEBHOOK_ENDPOINT}`;
}
