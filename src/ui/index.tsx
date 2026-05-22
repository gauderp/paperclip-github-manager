import { useMemo, useState } from "react";
import {
  useHostContext,
  useHostLocation,
  useHostNavigation,
  usePluginAction,
  usePluginData,
  type PluginPageProps,
  type PluginSidebarProps,
  type PluginWidgetProps
} from "@paperclipai/plugin-sdk/ui";
import { GITHUB_TOKEN_SECRET_KEY, PATHS } from "../constants.js";
import type { GitHubRepoSummary, ReposData, SyncOverviewData } from "../types.js";

type HealthData = {
  status: "ok" | "degraded" | "error";
  checkedAt: string;
  message?: string;
  login?: string;
  auth?: { configured: boolean; mode: "pat" | "secret-ref" | "none" };
};

type WebhookConfigData = {
  configured: boolean;
  config: {
    repoFullName: string;
    events: string[];
    hookId?: number;
    configuredAt: string;
    inboundUrl: string;
  } | null;
  inboundUrl: string;
};

const panelStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 8,
  padding: "1rem",
  display: "grid",
  gap: "0.75rem"
};

const buttonStyle: React.CSSProperties = {
  padding: "0.4rem 0.75rem",
  borderRadius: 6,
  border: "1px solid rgba(255,255,255,0.2)",
  background: "rgba(255,255,255,0.06)",
  cursor: "pointer"
};

const sidebarLinkClass =
  "flex w-full items-center gap-2.5 px-3 py-2 text-[13px] font-medium transition-colors no-underline";
const sidebarLinkActiveClass = "bg-accent text-foreground";
const sidebarLinkIdleClass = "text-foreground/80 hover:bg-accent/50 hover:text-foreground";

const NAV_ITEMS = [
  { path: PATHS.settings, label: "Configurações" },
  { path: PATHS.repos, label: "Repositórios" },
  { path: PATHS.pullRequests, label: "Pull requests" }
] as const;

function useGithubCompany() {
  const { companyId } = useHostContext();
  const companyParams = useMemo(
    () => (companyId ? { companyId } : undefined),
    [companyId]
  );
  return { companyId, companyParams };
}

function isPathActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Sub-navegação do módulo GitHub (estilo Projects). */
function GitHubModuleNav() {
  const nav = useHostNavigation();
  const { pathname } = useHostLocation();

  return (
    <nav style={{ display: "flex", flexDirection: "column", gap: "0.125rem" }}>
      {NAV_ITEMS.map((item) => {
        const href = nav.resolveHref(item.path);
        const active = isPathActive(pathname, href);
        return (
          <a
            key={item.path}
            {...nav.linkProps(item.path)}
            className={`${sidebarLinkClass} ${active ? sidebarLinkActiveClass : sidebarLinkIdleClass}`}
          >
            <span className="flex-1 truncate">{item.label}</span>
          </a>
        );
      })}
    </nav>
  );
}

/** Painel na sidebar principal (abaixo de Company), label GitHub. */
export function GitHubSidebarModule(_props: PluginSidebarProps) {
  return (
    <div style={{ display: "grid", gap: "0.25rem" }}>
      <div
        style={{
          padding: "0.25rem 0.75rem",
          fontSize: "0.7rem",
          fontWeight: 600,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          opacity: 0.55
        }}
      >
        GitHub
      </div>
      <GitHubModuleNav />
    </div>
  );
}

/** Sidebar ao navegar em rotas /github/*. */
export function GitHubRouteSidebar(_props: PluginSidebarProps) {
  const nav = useHostNavigation();

  return (
    <nav style={{ display: "flex", flexDirection: "column", gap: "0.25rem", padding: "0.5rem 0" }}>
      <a
        {...nav.linkProps("/dashboard")}
        className={`${sidebarLinkClass} ${sidebarLinkIdleClass}`}
      >
        <span className="flex-1 truncate">← Company dashboard</span>
      </a>
      <div
        style={{
          padding: "0.75rem 0.75rem 0.25rem",
          fontSize: "0.7rem",
          fontWeight: 600,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          opacity: 0.55
        }}
      >
        GitHub
      </div>
      <GitHubModuleNav />
    </nav>
  );
}

function RepoTable({ repos }: { repos: GitHubRepoSummary[] }) {
  if (repos.length === 0) {
    return <div>Nenhum repositório listado. Configure o token em Configurações.</div>;
  }

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
      <thead>
        <tr style={{ textAlign: "left", opacity: 0.7 }}>
          <th style={{ padding: "0.35rem 0" }}>Repositório</th>
          <th>Atualizado</th>
          <th>Visibilidade</th>
        </tr>
      </thead>
      <tbody>
        {repos.map((repo) => (
          <tr key={repo.id}>
            <td style={{ padding: "0.35rem 0" }}>
              <a href={repo.htmlUrl} target="_blank" rel="noreferrer">
                {repo.fullName}
              </a>
            </td>
            <td>{new Date(repo.updatedAt).toLocaleString()}</td>
            <td>{repo.private ? "private" : "public"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function DashboardWidget(_props: PluginWidgetProps) {
  const { companyParams } = useGithubCompany();
  const { data, loading, error } = usePluginData<HealthData>("health", companyParams);
  const ping = usePluginAction("ping");
  const nav = useHostNavigation();

  if (loading) return <div>Carregando status do GitHub...</div>;
  if (error) return <div>Erro do plugin: {error.message}</div>;

  return (
    <div style={{ display: "grid", gap: "0.5rem" }}>
      <strong>GitHub Manager</strong>
      <div>Status: {data?.status ?? "unknown"}</div>
      {data?.login ? <div>Conta: {data.login}</div> : null}
      {data?.message ? <div>{data.message}</div> : null}
      <div>Verificado: {data?.checkedAt ?? "nunca"}</div>
      {data?.status !== "ok" ? (
        <a {...nav.linkProps(PATHS.settings)} style={{ fontSize: "0.85rem" }}>
          Configurar token →
        </a>
      ) : null}
      <button style={buttonStyle} onClick={() => void ping()}>
        Ping Worker
      </button>
    </div>
  );
}

export function GitHubSettingsPage(_props: PluginPageProps) {
  const nav = useHostNavigation();
  const { companyId, companyParams } = useGithubCompany();
  const { data: health, loading, error, refresh } = usePluginData<HealthData>("health", companyParams);
  const saveGithubToken = usePluginAction("saveGithubToken");
  const saveGithubSecretRef = usePluginAction("saveGithubSecretRef");
  const clearGithubAuth = usePluginAction("clearGithubAuth");

  const [pat, setPat] = useState("");
  const [secretRef, setSecretRef] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [formMessage, setFormMessage] = useState<string | null>(null);

  async function runSave(label: string, fn: () => Promise<unknown>) {
    if (!companyId) {
      setFormMessage("Selecione uma company no header do Paperclip.");
      return;
    }
    setBusy(label);
    setFormMessage(null);
    try {
      await fn();
      setPat("");
      setFormMessage(`${label} — OK. Testando conexão…`);
      refresh();
    } catch (err) {
      setFormMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ padding: "1.5rem", display: "grid", gap: "1rem", maxWidth: 720 }}>
      <header>
        <h1 style={{ margin: 0 }}>GitHub — Configurações</h1>
        <p style={{ margin: "0.5rem 0 0", opacity: 0.8 }}>
          Conecte um Personal Access Token (PAT) da GitHub. O token fica no estado do plugin por
          company (o Paperclip ainda não resolve <code>secrets.read-ref</code> em workers — PAP-2394).
        </p>
      </header>

      {!companyId ? (
        <p style={{ margin: 0, opacity: 0.8 }}>Selecione uma company no header do Paperclip.</p>
      ) : null}

      <section style={panelStyle}>
        <strong>1. Personal Access Token (recomendado)</strong>
        <p style={{ margin: 0, opacity: 0.85 }}>
          Gere um PAT em GitHub → Settings → Developer settings. Escopos: <code>repo</code>,{" "}
          <code>read:user</code>; para webhooks também <code>admin:repo_hook</code>.
        </p>
        <label style={{ display: "grid", gap: "0.35rem" }}>
          PAT
          <input
            type="password"
            autoComplete="off"
            value={pat}
            onChange={(e) => setPat(e.target.value)}
            placeholder="ghp_…"
            style={{ maxWidth: 480, padding: "0.4rem 0.5rem" }}
          />
        </label>
        <button
          style={buttonStyle}
          type="button"
          disabled={Boolean(busy) || !companyId || !pat.trim()}
          onClick={() =>
            void runSave("Salvar token", () =>
              saveGithubToken({ companyId: companyId!, token: pat })
            )
          }
        >
          Salvar token
        </button>
      </section>

      <section style={panelStyle}>
        <strong>2. Secret ID (futuro)</strong>
        <p style={{ margin: 0, opacity: 0.85 }}>
          Se você já criou um secret em <strong>Company → Settings</strong> (chave{" "}
          <code>{GITHUB_TOKEN_SECRET_KEY}</code>), copie o <strong>ID (UUID)</strong> do secret — não
          basta a chave. Quando o Paperclip reabilitar secret refs, este campo passará a funcionar
          sem colar o PAT aqui.
        </p>
        <a
          {...nav.linkProps(PATHS.companySecrets)}
          className={sidebarLinkClass}
          style={{ display: "inline-flex", width: "auto", marginTop: "0.25rem" }}
        >
          Abrir Company Settings
        </a>
        <label style={{ display: "grid", gap: "0.35rem", marginTop: "0.75rem" }}>
          Secret ID (UUID)
          <input
            value={secretRef}
            onChange={(e) => setSecretRef(e.target.value)}
            placeholder="00000000-0000-0000-0000-000000000000"
            style={{ maxWidth: 480, padding: "0.4rem 0.5rem", fontFamily: "monospace" }}
          />
        </label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          <button
            style={buttonStyle}
            type="button"
            disabled={Boolean(busy) || !companyId || !secretRef.trim()}
            onClick={() =>
              void runSave("Salvar Secret ID", () =>
                saveGithubSecretRef({ companyId: companyId!, secretRef })
              )
            }
          >
            Salvar Secret ID
          </button>
          <button
            style={buttonStyle}
            type="button"
            disabled={Boolean(busy) || !companyId}
            onClick={() =>
              void runSave("Limpar credenciais", () => clearGithubAuth({ companyId: companyId! }))
            }
          >
            Limpar
          </button>
        </div>
      </section>

      <section style={panelStyle}>
        <strong>3. Testar conexão</strong>
        {health?.auth ? (
          <div style={{ fontSize: "0.85rem", opacity: 0.75 }}>
            Credencial: {health.auth.configured ? health.auth.mode : "nenhuma"}
          </div>
        ) : null}
        {loading ? <div>Verificando...</div> : null}
        {error ? <div>Erro: {error.message}</div> : null}
        {health ? (
          <div style={{ display: "grid", gap: "0.35rem" }}>
            <div>
              Status: <strong>{health.status}</strong>
              {health.login ? ` — @${health.login}` : ""}
            </div>
            {health.message ? <div>{health.message}</div> : null}
            <div style={{ fontSize: "0.85rem", opacity: 0.7 }}>
              Verificado: {new Date(health.checkedAt).toLocaleString()}
            </div>
          </div>
        ) : null}
        <button
          style={buttonStyle}
          type="button"
          disabled={Boolean(busy) || !companyId}
          onClick={() => refresh()}
        >
          Testar conexão
        </button>
        {health?.status === "ok" ? (
          <p style={{ margin: 0, color: "inherit", opacity: 0.85 }}>
            Token OK. Use <a {...nav.linkProps(PATHS.repos)}>Repositórios</a> e{" "}
            <a {...nav.linkProps(PATHS.pullRequests)}>Pull requests</a>.
          </p>
        ) : null}
      </section>

      {formMessage ? <div>{formMessage}</div> : null}
      {busy ? <div>Executando: {busy}…</div> : null}
    </div>
  );
}

export function GitHubReposPage(_props: PluginPageProps) {
  const nav = useHostNavigation();
  const { companyId, companyParams } = useGithubCompany();
  const { data: health, loading: healthLoading, error: healthError } =
    usePluginData<HealthData>("health", companyParams);
  const {
    data: reposData,
    loading: reposLoading,
    error: reposError,
    refresh: refreshRepos
  } = usePluginData<ReposData>("repos", companyParams);
  const {
    data: webhookData,
    loading: webhookLoading,
    refresh: refreshWebhook
  } = usePluginData<WebhookConfigData>("webhookConfig", companyParams);

  const setTrackedRepos = usePluginAction("setTrackedRepos");
  const configureWebhook = usePluginAction("configureWebhook");

  const [selectedRepo, setSelectedRepo] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const trackedSelection = selectedRepo || reposData?.repos[0]?.fullName || "";
  const needsToken = health?.status === "degraded" || health?.status === "error";

  async function runAction(label: string, fn: () => Promise<unknown>) {
    if (!companyId) {
      setActionMessage("Selecione uma company no host antes de continuar.");
      return;
    }
    setBusy(label);
    setActionMessage(null);
    try {
      await fn();
      refreshRepos();
      refreshWebhook();
      setActionMessage(`${label} concluído.`);
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ padding: "1.5rem", display: "grid", gap: "1rem", maxWidth: 960 }}>
      <header>
        <h1 style={{ margin: 0 }}>GitHub — Repositórios</h1>
        <p style={{ margin: "0.5rem 0 0", opacity: 0.8 }}>
          Liste repositórios e escolha quais rastrear para sync e webhooks.
        </p>
      </header>

      {needsToken ? (
        <section style={panelStyle}>
          <strong>Token não configurado</strong>
          <p style={{ margin: 0 }}>
            <a {...nav.linkProps(PATHS.settings)}>Abrir Configurações</a> e salve um PAT da GitHub.
          </p>
        </section>
      ) : null}

      <section style={panelStyle}>
        <strong>Conexão</strong>
        {healthLoading ? <div>Carregando...</div> : null}
        {healthError ? <div>Erro: {healthError.message}</div> : null}
        {health ? (
          <div>
            Status: {health.status}
            {health.login ? ` — ${health.login}` : ""}
            {health.message ? <div>{health.message}</div> : null}
          </div>
        ) : null}
      </section>

      <section style={panelStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
          <strong>Repositórios</strong>
          <button style={buttonStyle} disabled={Boolean(busy)} onClick={() => refreshRepos()}>
            Atualizar lista
          </button>
        </div>
        {reposLoading ? <div>Carregando repositórios...</div> : null}
        {reposError ? <div>Erro: {reposError.message}</div> : null}
        {reposData?.message ? <div>{reposData.message}</div> : null}
        {reposData ? <RepoTable repos={reposData.repos} /> : null}
        {reposData?.repos.length ? (
          <label style={{ display: "grid", gap: "0.35rem" }}>
            Repo para webhook
            <select
              value={trackedSelection}
              onChange={(e) => setSelectedRepo(e.target.value)}
              style={{ maxWidth: 420 }}
            >
              {reposData.repos.map((repo) => (
                <option key={repo.id} value={repo.fullName}>
                  {repo.fullName}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <button
          style={buttonStyle}
          disabled={Boolean(busy) || !trackedSelection || !companyId || needsToken}
          onClick={() =>
            void runAction("Salvar repos rastreados", () =>
              setTrackedRepos({
                companyId,
                repos: reposData?.repos.slice(0, 5).map((r) => r.fullName) ?? []
              })
            )
          }
        >
          Rastrear top 5 repos
        </button>
      </section>

      <section style={panelStyle}>
        <strong>Webhooks</strong>
        {webhookLoading ? <div>Carregando configuração...</div> : null}
        <div style={{ fontSize: "0.85rem", opacity: 0.85 }}>
          URL inbound: <code>{webhookData?.inboundUrl ?? "—"}</code>
        </div>
        {webhookData?.configured && webhookData.config ? (
          <div>
            Configurado para <strong>{webhookData.config.repoFullName}</strong> (hook{" "}
            {webhookData.config.hookId ?? "?"}) em{" "}
            {new Date(webhookData.config.configuredAt).toLocaleString()}
          </div>
        ) : (
          <div>Nenhum webhook registrado nesta company.</div>
        )}
        <button
          style={buttonStyle}
          disabled={Boolean(busy) || !companyId || !trackedSelection || needsToken}
          onClick={() =>
            void runAction("Registrar webhook", () =>
              configureWebhook({
                companyId: companyId!,
                repoFullName: trackedSelection,
                events: ["pull_request", "issues"]
              })
            )
          }
        >
          Registrar webhook no GitHub
        </button>
      </section>

      {actionMessage ? <div>{actionMessage}</div> : null}
      {busy ? <div>Executando: {busy}...</div> : null}
    </div>
  );
}

export function GitHubPullRequestsPage(_props: PluginPageProps) {
  const nav = useHostNavigation();
  const { companyId, companyParams } = useGithubCompany();
  const { data: health } = usePluginData<HealthData>("health", companyParams);
  const {
    data: syncOverview,
    loading: syncLoading,
    error: syncError,
    refresh: refreshSync
  } = usePluginData<SyncOverviewData>("syncOverview", companyParams);

  const syncAll = usePluginAction("syncAll");
  const syncPullRequests = usePluginAction("syncPullRequests");
  const syncIssues = usePluginAction("syncIssues");

  const [busy, setBusy] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const needsToken = health?.status === "degraded" || health?.status === "error";

  async function runAction(label: string, fn: () => Promise<unknown>) {
    if (!companyId) {
      setActionMessage("Selecione uma company no host.");
      return;
    }
    setBusy(label);
    setActionMessage(null);
    try {
      await fn();
      refreshSync();
      setActionMessage(`${label} concluído.`);
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ padding: "1.5rem", display: "grid", gap: "1rem", maxWidth: 960 }}>
      <header>
        <h1 style={{ margin: 0 }}>GitHub — Pull requests</h1>
        <p style={{ margin: "0.5rem 0 0", opacity: 0.8 }}>
          Sincronize PRs e issues abertos dos repositórios rastreados.
        </p>
      </header>

      {needsToken ? (
        <section style={panelStyle}>
          <a {...nav.linkProps(PATHS.settings)}>Configurar token GitHub</a>
        </section>
      ) : null}

      <section style={panelStyle}>
        <strong>Sync PRs / Issues</strong>
        {syncLoading ? <div>Carregando overview...</div> : null}
        {syncError ? <div>Erro: {syncError.message}</div> : null}
        {syncOverview ? (
          <div style={{ display: "grid", gap: "0.35rem" }}>
            <div>{syncOverview.message}</div>
            <div>
              PRs abertos: {syncOverview.pullRequestCount} — Issues abertas:{" "}
              {syncOverview.issueCount}
            </div>
            {syncOverview.lastSyncedAt ? (
              <div>Último sync: {new Date(syncOverview.lastSyncedAt).toLocaleString()}</div>
            ) : null}
          </div>
        ) : null}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          <button
            style={buttonStyle}
            disabled={Boolean(busy) || !companyId || needsToken}
            onClick={() => void runAction("Sync completo", () => syncAll({ companyId: companyId! }))}
          >
            Sync tudo
          </button>
          <button
            style={buttonStyle}
            disabled={Boolean(busy) || !companyId || needsToken}
            onClick={() =>
              void runAction("Sync PRs", () => syncPullRequests({ companyId: companyId! }))
            }
          >
            Sync PRs
          </button>
          <button
            style={buttonStyle}
            disabled={Boolean(busy) || !companyId || needsToken}
            onClick={() =>
              void runAction("Sync issues", () => syncIssues({ companyId: companyId! }))
            }
          >
            Sync issues
          </button>
        </div>
        {syncOverview?.recentPullRequests.length ? (
          <div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>PRs recentes</div>
            <ul style={{ margin: 0, paddingLeft: "1.2rem" }}>
              {syncOverview.recentPullRequests.map((pr) => (
                <li key={`${pr.repoFullName}#${pr.number}`}>
                  <a href={pr.htmlUrl} target="_blank" rel="noreferrer">
                    {pr.repoFullName}#{pr.number} — {pr.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {syncOverview?.recentIssues.length ? (
          <div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Issues recentes</div>
            <ul style={{ margin: 0, paddingLeft: "1.2rem" }}>
              {syncOverview.recentIssues.map((issue) => (
                <li key={`${issue.repoFullName}#${issue.number}`}>
                  <a href={issue.htmlUrl} target="_blank" rel="noreferrer">
                    {issue.repoFullName}#{issue.number} — {issue.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {actionMessage ? <div>{actionMessage}</div> : null}
      {busy ? <div>Executando: {busy}...</div> : null}
    </div>
  );
}
