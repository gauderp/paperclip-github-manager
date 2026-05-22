import type { PluginContext } from "@paperclipai/plugin-sdk";

export const GITHUB_PAT_STATE_KEY = "github.token.pat";
export const GITHUB_SECRET_REF_STATE_KEY = "github.token.secretRef";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type GithubAuthStatus = {
  configured: boolean;
  mode: "pat" | "secret-ref" | "none";
};

function companyScope(companyId: string) {
  return { scopeKind: "company" as const, scopeId: companyId };
}

export async function loadGithubPat(
  ctx: Pick<PluginContext, "state">,
  companyId: string
): Promise<string | null> {
  const raw = await ctx.state.get({ ...companyScope(companyId), stateKey: GITHUB_PAT_STATE_KEY });
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
}

export async function loadGithubSecretRef(
  ctx: Pick<PluginContext, "state">,
  companyId: string
): Promise<string | null> {
  const raw = await ctx.state.get({
    ...companyScope(companyId),
    stateKey: GITHUB_SECRET_REF_STATE_KEY
  });
  const ref = typeof raw === "string" ? raw.trim() : "";
  return UUID_RE.test(ref) ? ref : null;
}

export async function saveGithubPat(
  ctx: Pick<PluginContext, "state">,
  companyId: string,
  token: string
): Promise<void> {
  const trimmed = token.trim();
  if (!trimmed) {
    throw new Error("GitHub token is required");
  }
  await ctx.state.set({ ...companyScope(companyId), stateKey: GITHUB_PAT_STATE_KEY }, trimmed);
}

export async function saveGithubSecretRef(
  ctx: Pick<PluginContext, "state">,
  companyId: string,
  secretRef: string
): Promise<void> {
  const trimmed = secretRef.trim();
  if (!UUID_RE.test(trimmed)) {
    throw new Error("Secret ID must be a UUID from Company → Settings → Secrets");
  }
  await ctx.state.set(
    { ...companyScope(companyId), stateKey: GITHUB_SECRET_REF_STATE_KEY },
    trimmed
  );
}

export async function clearGithubAuth(
  ctx: Pick<PluginContext, "state">,
  companyId: string
): Promise<void> {
  await ctx.state.set({ ...companyScope(companyId), stateKey: GITHUB_PAT_STATE_KEY }, null);
  await ctx.state.set({ ...companyScope(companyId), stateKey: GITHUB_SECRET_REF_STATE_KEY }, null);
}

export async function getGithubAuthStatus(
  ctx: Pick<PluginContext, "state">,
  companyId: string
): Promise<GithubAuthStatus> {
  const pat = await loadGithubPat(ctx, companyId);
  if (pat) {
    return { configured: true, mode: "pat" };
  }
  const secretRef = await loadGithubSecretRef(ctx, companyId);
  if (secretRef) {
    return { configured: true, mode: "secret-ref" };
  }
  return { configured: false, mode: "none" };
}

/**
 * Resolves a GitHub PAT for the given company.
 * Prefers plugin state (PAT) because Paperclip currently fail-closes `secrets.resolve`.
 */
export async function resolveGithubToken(
  ctx: Pick<PluginContext, "state" | "secrets">,
  companyId: string
): Promise<string | null> {
  const pat = await loadGithubPat(ctx, companyId);
  if (pat) {
    return pat;
  }

  const secretRef = await loadGithubSecretRef(ctx, companyId);
  if (!secretRef) {
    return null;
  }

  try {
    return await ctx.secrets.resolve(secretRef);
  } catch {
    return null;
  }
}
