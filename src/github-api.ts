import type { PluginContext } from "@paperclipai/plugin-sdk";

export const GITHUB_API = "https://api.github.com";
export const GITHUB_WEBHOOK_ENDPOINT = "github-events";

export type GitHubFetchContext = Pick<PluginContext, "http" | "secrets" | "logger">;

export async function resolveGithubToken(ctx: GitHubFetchContext): Promise<string | null> {
  try {
    return await ctx.secrets.resolve("github_token");
  } catch {
    return null;
  }
}

export async function githubFetch(
  ctx: GitHubFetchContext,
  path: string,
  init?: RequestInit
): Promise<Response> {
  const token = await resolveGithubToken(ctx);
  if (!token) {
    return new Response(JSON.stringify({ message: "github_token not configured" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

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
