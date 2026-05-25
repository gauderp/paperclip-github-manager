# GitHub Manager v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the paperclip-github-manager plugin with local DB persistence, 3-layer sync, PR↔Card integration inside detail tabs, hierarchical agent review, and graphify knowledge graphs.

**Architecture:** Plugin uses Paperclip SDK's database migrations for local persistence. All UI reads from local DB (zero GitHub API calls on render). Sync happens via webhooks (real-time), 5-min cron (safety net), and manual trigger. Cards get a "GitHub" detail tab showing linked PRs with review actions. Graphify generates knowledge graphs on demand.

**Tech Stack:** TypeScript, @paperclipai/plugin-sdk (2026.517.0), React 18, esbuild, vitest

**Spec:** `docs/superpowers/specs/2026-05-24-github-manager-v2-design.md`

---

## File Structure

```
src/
  manifest.ts                    — plugin manifest with all capabilities, UI slots, jobs, webhooks, tools, managed agents
  worker.ts                      — definePlugin setup: registers all data/action/event/job/tool/webhook handlers
  db/
    migrations/
      001_initial.sql            — all tables (gh_repositories, gh_pull_requests, gh_issues, gh_pr_card_links, gh_sync_log)
    queries.ts                   — typed query functions for all DB operations (upsert, select, filter)
  sync/
    webhook-handler.ts           — processes GitHub webhook events (PR, issues), upserts DB, triggers link detection
    incremental-sync.ts          — 5-min cron job: fetches updated items since last sync per repo
    full-sync.ts                 — manual full sync of all tracked repos
    link-detector.ts             — pattern matching (branch/title regex) to auto-link PRs to Paperclip cards
  github/
    api-client.ts                — authenticated GitHub fetch with rate-limit awareness
    config.ts                    — token resolution (PAT → secret ref → env fallback)
  review/
    review-tools.ts              — agent tools: get diff, read file, create comment, submit review
    quick-check.ts               — lightweight automated PR checklist (description, tests, sensitive files)
  graphify/
    graph-generator.ts           — reads repo content via GitHub API, produces knowledge graph data
  types.ts                       — shared TypeScript types for all modules
  ui/
    index.tsx                    — re-exports all UI components for manifest
    components/
      SettingsPage.tsx           — token config, tracked repos, sync settings
      ReposPage.tsx              — repo list from DB, sync status, webhook/graphify actions
      PullRequestsPage.tsx       — PR list with filters (repo, status, author, linked)
      GraphsPage.tsx             — graphify results, interactive visualization
      DetailTab.tsx              — GitHub tab inside cards: linked PRs, review button, review summary
      DashboardWidget.tsx        — health status, counters, quick links
      Sidebar.tsx                — navigation + PR badge
      ReviewDropdown.tsx         — agent selector dropdown for review actions
      shared.ts                  — shared styles, constants, helper hooks
tests/
  api-client.test.ts
  queries.test.ts
  link-detector.test.ts
  webhook-handler.test.ts
  incremental-sync.test.ts
  review-tools.test.ts
  quick-check.test.ts
```

---

## Task 1: Project Scaffold & Build Config

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `esbuild.config.mjs`
- Create: `vitest.config.ts`
- Modify: existing files at project root

- [ ] **Step 1: Initialize package.json**

```json
{
  "name": "@gaud_erp/paperclip-github-manager",
  "version": "1.0.0",
  "description": "Paperclip plugin for GitHub repos, PR/issue sync, card integration, agent review, and graphify",
  "license": "MIT",
  "type": "module",
  "scripts": {
    "dev": "node esbuild.config.mjs --watch",
    "build": "node esbuild.config.mjs",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "prepublishOnly": "npm run build"
  },
  "files": [
    "dist",
    "package.json",
    "README.md",
    "LICENSE"
  ],
  "dependencies": {
    "@paperclipai/plugin-sdk": "2026.517.0"
  },
  "peerDependencies": {
    "react": ">=18"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "esbuild": "^0.25.0",
    "typescript": "^5.8.0",
    "vitest": "^3.2.0",
    "react": "^18.3.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Create esbuild.config.mjs**

```js
import { build, context } from "esbuild";

const isWatch = process.argv.includes("--watch");

const workerConfig = {
  entryPoints: ["src/worker.ts"],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  outfile: "dist/worker.js",
  sourcemap: true,
  external: ["@paperclipai/plugin-sdk"],
};

const uiConfig = {
  entryPoints: ["src/ui/index.tsx"],
  bundle: true,
  platform: "browser",
  target: "es2022",
  format: "esm",
  outfile: "dist/ui/index.js",
  sourcemap: true,
  external: ["react", "react-dom", "@paperclipai/plugin-sdk"],
  jsx: "automatic",
};

if (isWatch) {
  const [workerCtx, uiCtx] = await Promise.all([
    context(workerConfig),
    context(uiConfig),
  ]);
  await Promise.all([workerCtx.watch(), uiCtx.watch()]);
  console.log("Watching for changes...");
} else {
  await Promise.all([build(workerConfig), build(uiConfig)]);
  console.log("Build complete.");
}
```

- [ ] **Step 4: Create vitest.config.ts**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 5: Install dependencies and verify build**

Run: `npm install`
Expected: node_modules created, no errors

Run: `npm run typecheck`
Expected: May have errors (no source yet) — just verifying TS config loads

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.json esbuild.config.mjs vitest.config.ts
git commit -m "chore: scaffold project with build config, TS, vitest"
```

---

## Task 2: Types & DB Migration

**Files:**
- Create: `src/types.ts`
- Create: `src/db/migrations/001_initial.sql`
- Create: `src/db/queries.ts`
- Test: `tests/queries.test.ts`

- [ ] **Step 1: Create shared types**

```ts
// src/types.ts

export type GitHubRepo = {
  id: number;
  fullName: string;
  owner: string;
  name: string;
  private: boolean;
  defaultBranch: string;
  htmlUrl: string;
  description: string | null;
  language: string | null;
  topics: string[];
  updatedAt: string;
  syncedAt: string;
};

export type GitHubPR = {
  id: number;
  repoId: number;
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed" | "merged";
  author: string;
  headBranch: string;
  baseBranch: string;
  htmlUrl: string;
  draft: boolean;
  mergeable: boolean | null;
  mergedAt: string | null;
  createdAt: string;
  updatedAt: string;
  syncedAt: string;
};

export type GitHubIssue = {
  id: number;
  repoId: number;
  number: number;
  title: string;
  body: string | null;
  state: string;
  author: string;
  labels: string[];
  htmlUrl: string;
  createdAt: string;
  updatedAt: string;
  syncedAt: string;
};

export type PRCardLink = {
  id: number;
  prId: number;
  issueId: string;
  linkSource: "webhook" | "pattern" | "manual";
  createdAt: string;
};

export type SyncLogEntry = {
  id: number;
  scope: "full" | "incremental" | "webhook";
  reposSynced: number;
  prsSynced: number;
  issuesSynced: number;
  errors: string[];
  startedAt: string;
  finishedAt: string | null;
};

export type PRWithRepo = GitHubPR & {
  repoFullName: string;
};

export type PRWithLinks = PRWithRepo & {
  linkedCardIds: string[];
};

export type QuickCheckResult = {
  hasDescription: boolean;
  hasTests: boolean;
  sensitiveFiles: string[];
  checkedAt: string;
};

export type ReviewSummary = {
  agentKey: string;
  agentName: string;
  verdict: "APPROVE" | "REQUEST_CHANGES" | "COMMENT";
  commentCount: number;
  reviewedAt: string;
};
```

- [ ] **Step 2: Create DB migration**

```sql
-- src/db/migrations/001_initial.sql

CREATE TABLE IF NOT EXISTS gh_repositories (
  id            INTEGER PRIMARY KEY,
  full_name     TEXT NOT NULL UNIQUE,
  owner         TEXT NOT NULL,
  name          TEXT NOT NULL,
  private       BOOLEAN NOT NULL DEFAULT false,
  default_branch TEXT NOT NULL DEFAULT 'main',
  html_url      TEXT NOT NULL,
  description   TEXT,
  language      TEXT,
  topics        TEXT DEFAULT '[]',
  updated_at    TEXT NOT NULL,
  synced_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS gh_pull_requests (
  id            INTEGER PRIMARY KEY,
  repo_id       INTEGER NOT NULL REFERENCES gh_repositories(id) ON DELETE CASCADE,
  number        INTEGER NOT NULL,
  title         TEXT NOT NULL,
  body          TEXT,
  state         TEXT NOT NULL DEFAULT 'open',
  author        TEXT NOT NULL,
  head_branch   TEXT NOT NULL,
  base_branch   TEXT NOT NULL,
  html_url      TEXT NOT NULL,
  draft         BOOLEAN NOT NULL DEFAULT false,
  mergeable     BOOLEAN,
  merged_at     TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  synced_at     TEXT NOT NULL,
  UNIQUE(repo_id, number)
);

CREATE TABLE IF NOT EXISTS gh_issues (
  id            INTEGER PRIMARY KEY,
  repo_id       INTEGER NOT NULL REFERENCES gh_repositories(id) ON DELETE CASCADE,
  number        INTEGER NOT NULL,
  title         TEXT NOT NULL,
  body          TEXT,
  state         TEXT NOT NULL DEFAULT 'open',
  author        TEXT NOT NULL,
  labels        TEXT DEFAULT '[]',
  html_url      TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  synced_at     TEXT NOT NULL,
  UNIQUE(repo_id, number)
);

CREATE TABLE IF NOT EXISTS gh_pr_card_links (
  id            SERIAL PRIMARY KEY,
  pr_id         INTEGER NOT NULL REFERENCES gh_pull_requests(id) ON DELETE CASCADE,
  issue_id      TEXT NOT NULL,
  link_source   TEXT NOT NULL CHECK(link_source IN ('webhook', 'pattern', 'manual')),
  created_at    TEXT NOT NULL,
  UNIQUE(pr_id, issue_id)
);

CREATE TABLE IF NOT EXISTS gh_sync_log (
  id            SERIAL PRIMARY KEY,
  scope         TEXT NOT NULL CHECK(scope IN ('full', 'incremental', 'webhook')),
  repos_synced  INTEGER NOT NULL DEFAULT 0,
  prs_synced    INTEGER NOT NULL DEFAULT 0,
  issues_synced INTEGER NOT NULL DEFAULT 0,
  errors        TEXT DEFAULT '[]',
  started_at    TEXT NOT NULL,
  finished_at   TEXT
);
```

- [ ] **Step 3: Create query functions**

```ts
// src/db/queries.ts

import type { PluginContext } from "@paperclipai/plugin-sdk";
import type {
  GitHubRepo,
  GitHubPR,
  GitHubIssue,
  PRCardLink,
  SyncLogEntry,
  PRWithRepo,
} from "../types.js";

type DB = PluginContext["database"];

// ── Repositories ──

export async function upsertRepo(db: DB, repo: Omit<GitHubRepo, "syncedAt">): Promise<void> {
  const now = new Date().toISOString();
  await db.mutate(
    `INSERT INTO gh_repositories (id, full_name, owner, name, private, default_branch, html_url, description, language, topics, updated_at, synced_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (id) DO UPDATE SET
       full_name = EXCLUDED.full_name,
       owner = EXCLUDED.owner,
       name = EXCLUDED.name,
       private = EXCLUDED.private,
       default_branch = EXCLUDED.default_branch,
       html_url = EXCLUDED.html_url,
       description = EXCLUDED.description,
       language = EXCLUDED.language,
       topics = EXCLUDED.topics,
       updated_at = EXCLUDED.updated_at,
       synced_at = EXCLUDED.synced_at`,
    [repo.id, repo.fullName, repo.owner, repo.name, repo.private, repo.defaultBranch,
     repo.htmlUrl, repo.description, repo.language, JSON.stringify(repo.topics),
     repo.updatedAt, now],
  );
}

export async function listRepos(db: DB): Promise<GitHubRepo[]> {
  const rows = await db.query("SELECT * FROM gh_repositories ORDER BY full_name");
  return rows.map(mapRepo);
}

export async function getRepoByFullName(db: DB, fullName: string): Promise<GitHubRepo | null> {
  const rows = await db.query("SELECT * FROM gh_repositories WHERE full_name = $1", [fullName]);
  return rows.length > 0 ? mapRepo(rows[0]) : null;
}

function mapRepo(row: Record<string, unknown>): GitHubRepo {
  return {
    id: row.id as number,
    fullName: row.full_name as string,
    owner: row.owner as string,
    name: row.name as string,
    private: row.private as boolean,
    defaultBranch: row.default_branch as string,
    htmlUrl: row.html_url as string,
    description: row.description as string | null,
    language: row.language as string | null,
    topics: JSON.parse((row.topics as string) || "[]"),
    updatedAt: row.updated_at as string,
    syncedAt: row.synced_at as string,
  };
}

// ── Pull Requests ──

export async function upsertPR(db: DB, pr: Omit<GitHubPR, "syncedAt">): Promise<void> {
  const now = new Date().toISOString();
  await db.mutate(
    `INSERT INTO gh_pull_requests (id, repo_id, number, title, body, state, author, head_branch, base_branch, html_url, draft, mergeable, merged_at, created_at, updated_at, synced_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     ON CONFLICT (repo_id, number) DO UPDATE SET
       title = EXCLUDED.title, body = EXCLUDED.body, state = EXCLUDED.state,
       author = EXCLUDED.author, head_branch = EXCLUDED.head_branch,
       base_branch = EXCLUDED.base_branch, html_url = EXCLUDED.html_url,
       draft = EXCLUDED.draft, mergeable = EXCLUDED.mergeable,
       merged_at = EXCLUDED.merged_at, updated_at = EXCLUDED.updated_at,
       synced_at = EXCLUDED.synced_at`,
    [pr.id, pr.repoId, pr.number, pr.title, pr.body, pr.state,
     pr.author, pr.headBranch, pr.baseBranch, pr.htmlUrl, pr.draft,
     pr.mergeable, pr.mergedAt, pr.createdAt, pr.updatedAt, now],
  );
}

export async function listPRs(
  db: DB,
  filters?: { repoId?: number; state?: string; author?: string },
): Promise<PRWithRepo[]> {
  let sql = `SELECT p.*, r.full_name AS repo_full_name
             FROM gh_pull_requests p
             JOIN gh_repositories r ON r.id = p.repo_id
             WHERE 1=1`;
  const params: unknown[] = [];
  let idx = 1;

  if (filters?.repoId) {
    sql += ` AND p.repo_id = $${idx++}`;
    params.push(filters.repoId);
  }
  if (filters?.state) {
    sql += ` AND p.state = $${idx++}`;
    params.push(filters.state);
  }
  if (filters?.author) {
    sql += ` AND p.author = $${idx++}`;
    params.push(filters.author);
  }
  sql += " ORDER BY p.updated_at DESC";

  const rows = await db.query(sql, params);
  return rows.map(mapPRWithRepo);
}

export async function getPRByRepoAndNumber(
  db: DB, repoId: number, number: number,
): Promise<PRWithRepo | null> {
  const rows = await db.query(
    `SELECT p.*, r.full_name AS repo_full_name
     FROM gh_pull_requests p
     JOIN gh_repositories r ON r.id = p.repo_id
     WHERE p.repo_id = $1 AND p.number = $2`,
    [repoId, number],
  );
  return rows.length > 0 ? mapPRWithRepo(rows[0]) : null;
}

function mapPRWithRepo(row: Record<string, unknown>): PRWithRepo {
  return {
    id: row.id as number,
    repoId: row.repo_id as number,
    number: row.number as number,
    title: row.title as string,
    body: row.body as string | null,
    state: row.state as GitHubPR["state"],
    author: row.author as string,
    headBranch: row.head_branch as string,
    baseBranch: row.base_branch as string,
    htmlUrl: row.html_url as string,
    draft: row.draft as boolean,
    mergeable: row.mergeable as boolean | null,
    mergedAt: row.merged_at as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    syncedAt: row.synced_at as string,
    repoFullName: row.repo_full_name as string,
  };
}

// ── Issues ──

export async function upsertIssue(db: DB, issue: Omit<GitHubIssue, "syncedAt">): Promise<void> {
  const now = new Date().toISOString();
  await db.mutate(
    `INSERT INTO gh_issues (id, repo_id, number, title, body, state, author, labels, html_url, created_at, updated_at, synced_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (repo_id, number) DO UPDATE SET
       title = EXCLUDED.title, body = EXCLUDED.body, state = EXCLUDED.state,
       author = EXCLUDED.author, labels = EXCLUDED.labels,
       html_url = EXCLUDED.html_url, updated_at = EXCLUDED.updated_at,
       synced_at = EXCLUDED.synced_at`,
    [issue.id, issue.repoId, issue.number, issue.title, issue.body,
     issue.state, issue.author, JSON.stringify(issue.labels),
     issue.htmlUrl, issue.createdAt, issue.updatedAt, now],
  );
}

// ── PR ↔ Card Links ──

export async function linkPRToCard(
  db: DB, prId: number, issueId: string, source: PRCardLink["linkSource"],
): Promise<void> {
  await db.mutate(
    `INSERT INTO gh_pr_card_links (pr_id, issue_id, link_source, created_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (pr_id, issue_id) DO NOTHING`,
    [prId, issueId, source, new Date().toISOString()],
  );
}

export async function getLinksForCard(db: DB, issueId: string): Promise<PRWithRepo[]> {
  const rows = await db.query(
    `SELECT p.*, r.full_name AS repo_full_name
     FROM gh_pr_card_links l
     JOIN gh_pull_requests p ON p.id = l.pr_id
     JOIN gh_repositories r ON r.id = p.repo_id
     WHERE l.issue_id = $1
     ORDER BY p.updated_at DESC`,
    [issueId],
  );
  return rows.map(mapPRWithRepo);
}

export async function getLinksForPR(db: DB, prId: number): Promise<PRCardLink[]> {
  const rows = await db.query(
    "SELECT * FROM gh_pr_card_links WHERE pr_id = $1",
    [prId],
  );
  return rows.map((r) => ({
    id: r.id as number,
    prId: r.pr_id as number,
    issueId: r.issue_id as string,
    linkSource: r.link_source as PRCardLink["linkSource"],
    createdAt: r.created_at as string,
  }));
}

// ── Sync Log ──

export async function createSyncLog(
  db: DB, scope: SyncLogEntry["scope"],
): Promise<number> {
  const rows = await db.mutate(
    `INSERT INTO gh_sync_log (scope, started_at) VALUES ($1, $2) RETURNING id`,
    [scope, new Date().toISOString()],
  );
  return (rows as unknown as Array<{ id: number }>)[0].id;
}

export async function completeSyncLog(
  db: DB, id: number, stats: { reposSynced: number; prsSynced: number; issuesSynced: number; errors: string[] },
): Promise<void> {
  await db.mutate(
    `UPDATE gh_sync_log SET repos_synced=$1, prs_synced=$2, issues_synced=$3, errors=$4, finished_at=$5 WHERE id=$6`,
    [stats.reposSynced, stats.prsSynced, stats.issuesSynced, JSON.stringify(stats.errors), new Date().toISOString(), id],
  );
}

export async function getLastSyncTime(db: DB): Promise<string | null> {
  const rows = await db.query(
    "SELECT finished_at FROM gh_sync_log WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1",
  );
  return rows.length > 0 ? (rows[0].finished_at as string) : null;
}
```

- [ ] **Step 4: Write query tests**

```ts
// tests/queries.test.ts

import { describe, it, expect, vi } from "vitest";
import { linkPRToCard, getLinksForCard } from "../src/db/queries.js";

describe("queries", () => {
  function mockDB() {
    const store: Record<string, unknown[]> = {};
    return {
      query: vi.fn(async () => [] as Record<string, unknown>[]),
      mutate: vi.fn(async () => undefined),
    };
  }

  describe("linkPRToCard", () => {
    it("calls mutate with correct INSERT", async () => {
      const db = mockDB();
      await linkPRToCard(db as any, 42, "issue-abc", "manual");
      expect(db.mutate).toHaveBeenCalledOnce();
      const [sql, params] = db.mutate.mock.calls[0];
      expect(sql).toContain("INSERT INTO gh_pr_card_links");
      expect(params[0]).toBe(42);
      expect(params[1]).toBe("issue-abc");
      expect(params[2]).toBe("manual");
    });
  });

  describe("getLinksForCard", () => {
    it("queries by issue_id with JOIN", async () => {
      const db = mockDB();
      await getLinksForCard(db as any, "issue-xyz");
      expect(db.query).toHaveBeenCalledOnce();
      const [sql, params] = db.query.mock.calls[0];
      expect(sql).toContain("gh_pr_card_links");
      expect(sql).toContain("JOIN gh_pull_requests");
      expect(params[0]).toBe("issue-xyz");
    });
  });
});
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/queries.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/db/
git commit -m "feat: add types, DB migration, and typed query layer"
```

---

## Task 3: GitHub API Client

**Files:**
- Create: `src/github/config.ts`
- Create: `src/github/api-client.ts`
- Test: `tests/api-client.test.ts`

- [ ] **Step 1: Create token resolution**

```ts
// src/github/config.ts

import type { PluginContext } from "@paperclipai/plugin-sdk";

const GITHUB_PAT_KEY = "github_pat";
const GITHUB_SECRET_REF_KEY = "github_secret_ref";

export async function resolveGithubToken(ctx: PluginContext, companyId: string): Promise<string> {
  // 1. Check company-scoped PAT
  const pat = await ctx.state.get({
    scopeKind: "company",
    scopeId: companyId,
    stateKey: GITHUB_PAT_KEY,
  });
  if (pat && typeof pat === "string" && pat.trim()) return pat.trim();

  // 2. Check secret reference
  const secretRef = await ctx.state.get({
    scopeKind: "company",
    scopeId: companyId,
    stateKey: GITHUB_SECRET_REF_KEY,
  });
  if (secretRef && typeof secretRef === "string" && secretRef.trim()) {
    const resolved = await ctx.secrets.resolve(secretRef.trim());
    if (resolved) return resolved;
  }

  // 3. Env fallback
  const envToken = process.env.GITHUB_TOKEN?.trim();
  if (envToken) return envToken;

  throw new Error("No GitHub token configured. Set a PAT or secret reference in Settings.");
}

export async function saveGithubPAT(ctx: PluginContext, companyId: string, token: string): Promise<void> {
  await ctx.state.set({
    scopeKind: "company",
    scopeId: companyId,
    stateKey: GITHUB_PAT_KEY,
  }, token);
}

export async function saveGithubSecretRef(ctx: PluginContext, companyId: string, ref: string): Promise<void> {
  await ctx.state.set({
    scopeKind: "company",
    scopeId: companyId,
    stateKey: GITHUB_SECRET_REF_KEY,
  }, ref);
}

export function getGithubApiBase(): string {
  const base = process.env.GITHUB_API_URL?.trim();
  return base ? base.replace(/\/+$/, "") : "https://api.github.com";
}
```

- [ ] **Step 2: Create API client**

```ts
// src/github/api-client.ts

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
```

- [ ] **Step 3: Write API client test**

```ts
// tests/api-client.test.ts

import { describe, it, expect, vi } from "vitest";
import { isRateLimitSafe } from "../src/github/api-client.js";
import type { RateLimitInfo } from "../src/github/api-client.js";

describe("api-client", () => {
  describe("isRateLimitSafe", () => {
    it("returns true when remaining > threshold", () => {
      const info: RateLimitInfo = { remaining: 500, limit: 5000, resetAt: "" };
      expect(isRateLimitSafe(info)).toBe(true);
    });

    it("returns false when remaining <= threshold", () => {
      const info: RateLimitInfo = { remaining: 50, limit: 5000, resetAt: "" };
      expect(isRateLimitSafe(info)).toBe(false);
    });

    it("accepts custom threshold", () => {
      const info: RateLimitInfo = { remaining: 50, limit: 5000, resetAt: "" };
      expect(isRateLimitSafe(info, 30)).toBe(true);
    });
  });
});
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/api-client.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/github/ tests/api-client.test.ts
git commit -m "feat: add GitHub API client with token resolution and rate limiting"
```

---

## Task 4: Link Detector (PR ↔ Card)

**Files:**
- Create: `src/sync/link-detector.ts`
- Test: `tests/link-detector.test.ts`

- [ ] **Step 1: Write failing tests for pattern matching**

```ts
// tests/link-detector.test.ts

import { describe, it, expect } from "vitest";
import { extractCardIds } from "../src/sync/link-detector.js";

describe("extractCardIds", () => {
  it("finds CARD-123 in branch name", () => {
    expect(extractCardIds("feature/CARD-123-add-login", "some title"))
      .toEqual(["CARD-123"]);
  });

  it("finds #456 in PR title", () => {
    expect(extractCardIds("feature/something", "Fix bug #456"))
      .toEqual(["#456"]);
  });

  it("finds multiple IDs across branch and title", () => {
    expect(extractCardIds("CARD-10-and-CARD-20", "also #30"))
      .toEqual(["CARD-10", "CARD-20", "#30"]);
  });

  it("returns empty array when no IDs found", () => {
    expect(extractCardIds("feature/something", "no ids here"))
      .toEqual([]);
  });

  it("deduplicates IDs", () => {
    expect(extractCardIds("CARD-5-fix", "Fixes CARD-5"))
      .toEqual(["CARD-5"]);
  });

  it("handles issue key formats like ABC-123", () => {
    expect(extractCardIds("main", "Implements ABC-42 feature"))
      .toEqual(["ABC-42"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/link-detector.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement link detector**

```ts
// src/sync/link-detector.ts

import type { PluginContext } from "@paperclipai/plugin-sdk";
import { linkPRToCard } from "../db/queries.js";

// Matches: CARD-123, ABC-42, PROJ-1 (uppercase prefix + number)
const KEY_PATTERN = /\b([A-Z][A-Z0-9]+-\d+)\b/g;
// Matches: #123 (hash + number, common in Paperclip issue references)
const HASH_PATTERN = /#(\d+)\b/g;

export function extractCardIds(branch: string, title: string): string[] {
  const text = `${branch} ${title}`;
  const ids = new Set<string>();

  for (const match of text.matchAll(KEY_PATTERN)) {
    ids.add(match[1]);
  }
  for (const match of text.matchAll(HASH_PATTERN)) {
    ids.add(`#${match[1]}`);
  }

  return [...ids];
}

export async function detectAndLinkCards(
  ctx: PluginContext,
  prId: number,
  branch: string,
  title: string,
): Promise<string[]> {
  const cardIds = extractCardIds(branch, title);
  for (const cardId of cardIds) {
    await linkPRToCard(ctx.database, prId, cardId, "pattern");
  }
  return cardIds;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/link-detector.test.ts`
Expected: PASS (all 6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/sync/link-detector.ts tests/link-detector.test.ts
git commit -m "feat: add PR↔Card link detector with pattern matching"
```

---

## Task 5: Sync Engine (Webhook + Incremental + Full)

**Files:**
- Create: `src/sync/webhook-handler.ts`
- Create: `src/sync/incremental-sync.ts`
- Create: `src/sync/full-sync.ts`
- Test: `tests/webhook-handler.test.ts`
- Test: `tests/incremental-sync.test.ts`

- [ ] **Step 1: Create webhook handler**

```ts
// src/sync/webhook-handler.ts

import type { PluginContext, PluginWebhookInput } from "@paperclipai/plugin-sdk";
import { upsertRepo, upsertPR, upsertIssue } from "../db/queries.js";
import { detectAndLinkCards } from "./link-detector.js";
import type { GitHubPR, GitHubIssue } from "../types.js";

export async function handleGithubWebhook(
  ctx: PluginContext,
  input: PluginWebhookInput,
): Promise<void> {
  const event = input.headers["x-github-event"];
  const payload = input.parsedBody as Record<string, unknown>;

  if (!payload || !event) {
    ctx.logger.warn("Webhook received with missing event header or body");
    return;
  }

  if (event === "pull_request") {
    await handlePullRequestEvent(ctx, payload);
  } else if (event === "issues") {
    await handleIssuesEvent(ctx, payload);
  } else {
    ctx.logger.info(`Ignoring GitHub event: ${event}`);
  }
}

async function handlePullRequestEvent(
  ctx: PluginContext,
  payload: Record<string, unknown>,
): Promise<void> {
  const prData = payload.pull_request as Record<string, unknown>;
  const repoData = payload.repository as Record<string, unknown>;
  if (!prData || !repoData) return;

  // Ensure repo exists locally
  await upsertRepo(ctx.database, {
    id: repoData.id as number,
    fullName: repoData.full_name as string,
    owner: (repoData.owner as Record<string, unknown>).login as string,
    name: repoData.name as string,
    private: repoData.private as boolean,
    defaultBranch: repoData.default_branch as string,
    htmlUrl: repoData.html_url as string,
    description: repoData.description as string | null,
    language: repoData.language as string | null,
    topics: (repoData.topics as string[]) ?? [],
    updatedAt: repoData.updated_at as string,
  });

  const merged = prData.merged as boolean;
  const state = merged ? "merged" : (prData.state as string);

  const pr: Omit<GitHubPR, "syncedAt"> = {
    id: prData.id as number,
    repoId: repoData.id as number,
    number: prData.number as number,
    title: prData.title as string,
    body: prData.body as string | null,
    state: state as GitHubPR["state"],
    author: (prData.user as Record<string, unknown>).login as string,
    headBranch: (prData.head as Record<string, unknown>).ref as string,
    baseBranch: (prData.base as Record<string, unknown>).ref as string,
    htmlUrl: prData.html_url as string,
    draft: prData.draft as boolean,
    mergeable: prData.mergeable as boolean | null,
    mergedAt: prData.merged_at as string | null,
    createdAt: prData.created_at as string,
    updatedAt: prData.updated_at as string,
  };

  await upsertPR(ctx.database, pr);

  // Auto-link to cards
  await detectAndLinkCards(ctx, pr.id, pr.headBranch, pr.title);

  ctx.logger.info(`Webhook: upserted PR #${pr.number} from ${repoData.full_name}`);
}

async function handleIssuesEvent(
  ctx: PluginContext,
  payload: Record<string, unknown>,
): Promise<void> {
  const issueData = payload.issue as Record<string, unknown>;
  const repoData = payload.repository as Record<string, unknown>;
  if (!issueData || !repoData) return;

  await upsertRepo(ctx.database, {
    id: repoData.id as number,
    fullName: repoData.full_name as string,
    owner: (repoData.owner as Record<string, unknown>).login as string,
    name: repoData.name as string,
    private: repoData.private as boolean,
    defaultBranch: repoData.default_branch as string,
    htmlUrl: repoData.html_url as string,
    description: repoData.description as string | null,
    language: repoData.language as string | null,
    topics: (repoData.topics as string[]) ?? [],
    updatedAt: repoData.updated_at as string,
  });

  const issue: Omit<GitHubIssue, "syncedAt"> = {
    id: issueData.id as number,
    repoId: repoData.id as number,
    number: issueData.number as number,
    title: issueData.title as string,
    body: issueData.body as string | null,
    state: issueData.state as string,
    author: (issueData.user as Record<string, unknown>).login as string,
    labels: ((issueData.labels as Array<Record<string, unknown>>) ?? []).map(
      (l) => l.name as string,
    ),
    htmlUrl: issueData.html_url as string,
    createdAt: issueData.created_at as string,
    updatedAt: issueData.updated_at as string,
  };

  await upsertIssue(ctx.database, issue);
  ctx.logger.info(`Webhook: upserted issue #${issue.number} from ${repoData.full_name}`);
}
```

- [ ] **Step 2: Create incremental sync**

```ts
// src/sync/incremental-sync.ts

import type { PluginContext } from "@paperclipai/plugin-sdk";
import { githubFetch, isRateLimitSafe } from "../github/api-client.js";
import {
  listRepos, upsertPR, upsertIssue,
  getLastSyncTime, createSyncLog, completeSyncLog,
} from "../db/queries.js";
import { detectAndLinkCards } from "./link-detector.js";
import type { GitHubPR, GitHubIssue } from "../types.js";

export async function runIncrementalSync(ctx: PluginContext, companyId: string): Promise<void> {
  const repos = await listRepos(ctx.database);
  if (repos.length === 0) return;

  const lastSync = await getLastSyncTime(ctx.database);
  const since = lastSync ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const logId = await createSyncLog(ctx.database, "incremental");
  let reposSynced = 0;
  let prsSynced = 0;
  let issuesSynced = 0;
  const errors: string[] = [];

  for (const repo of repos) {
    try {
      const prResult = await syncRepoPRs(ctx, companyId, repo.id, repo.fullName, since);
      const issueResult = await syncRepoIssues(ctx, companyId, repo.id, repo.fullName, since);

      prsSynced += prResult;
      issuesSynced += issueResult;
      reposSynced++;
    } catch (err) {
      const msg = `${repo.fullName}: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(msg);
      ctx.logger.error(`Sync error: ${msg}`);
    }
  }

  await completeSyncLog(ctx.database, logId, { reposSynced, prsSynced, issuesSynced, errors });
  ctx.logger.info(`Incremental sync done: ${reposSynced} repos, ${prsSynced} PRs, ${issuesSynced} issues`);
}

async function syncRepoPRs(
  ctx: PluginContext, companyId: string,
  repoId: number, fullName: string, since: string,
): Promise<number> {
  const { data, rateLimit } = await githubFetch(
    ctx, companyId,
    `/repos/${fullName}/pulls?state=all&sort=updated&direction=desc&per_page=100&since=${since}`,
  );

  if (!isRateLimitSafe(rateLimit)) {
    ctx.logger.warn(`Rate limit low (${rateLimit.remaining}), skipping remaining repos`);
  }

  const items = data as Array<Record<string, unknown>>;
  for (const item of items) {
    const merged = item.merged_at !== null && item.merged_at !== undefined;
    const state = merged ? "merged" : (item.state as string);

    const pr: Omit<GitHubPR, "syncedAt"> = {
      id: item.id as number,
      repoId,
      number: item.number as number,
      title: item.title as string,
      body: item.body as string | null,
      state: state as GitHubPR["state"],
      author: (item.user as Record<string, unknown>).login as string,
      headBranch: (item.head as Record<string, unknown>).ref as string,
      baseBranch: (item.base as Record<string, unknown>).ref as string,
      htmlUrl: item.html_url as string,
      draft: item.draft as boolean,
      mergeable: item.mergeable as boolean | null,
      mergedAt: item.merged_at as string | null,
      createdAt: item.created_at as string,
      updatedAt: item.updated_at as string,
    };

    await upsertPR(ctx.database, pr);
    await detectAndLinkCards(ctx, pr.id, pr.headBranch, pr.title);
  }

  return items.length;
}

async function syncRepoIssues(
  ctx: PluginContext, companyId: string,
  repoId: number, fullName: string, since: string,
): Promise<number> {
  const { data } = await githubFetch(
    ctx, companyId,
    `/repos/${fullName}/issues?state=all&sort=updated&direction=desc&per_page=100&since=${since}&filter=all`,
  );

  const items = (data as Array<Record<string, unknown>>).filter(
    (item) => !item.pull_request, // GitHub API returns PRs in issues endpoint
  );

  for (const item of items) {
    const issue: Omit<GitHubIssue, "syncedAt"> = {
      id: item.id as number,
      repoId,
      number: item.number as number,
      title: item.title as string,
      body: item.body as string | null,
      state: item.state as string,
      author: (item.user as Record<string, unknown>).login as string,
      labels: ((item.labels as Array<Record<string, unknown>>) ?? []).map(
        (l) => l.name as string,
      ),
      htmlUrl: item.html_url as string,
      createdAt: item.created_at as string,
      updatedAt: item.updated_at as string,
    };

    await upsertIssue(ctx.database, issue);
  }

  return items.length;
}
```

- [ ] **Step 3: Create full sync**

```ts
// src/sync/full-sync.ts

import type { PluginContext } from "@paperclipai/plugin-sdk";
import { githubFetch } from "../github/api-client.js";
import {
  upsertRepo, listRepos, upsertPR, upsertIssue,
  createSyncLog, completeSyncLog,
} from "../db/queries.js";
import { detectAndLinkCards } from "./link-detector.js";
import type { GitHubRepo, GitHubPR, GitHubIssue } from "../types.js";

export async function runFullSync(ctx: PluginContext, companyId: string): Promise<void> {
  const repos = await listRepos(ctx.database);
  if (repos.length === 0) return;

  const logId = await createSyncLog(ctx.database, "full");
  let reposSynced = 0;
  let prsSynced = 0;
  let issuesSynced = 0;
  const errors: string[] = [];

  for (const repo of repos) {
    try {
      // Refresh repo metadata
      const { data: repoData } = await githubFetch(ctx, companyId, `/repos/${repo.fullName}`);
      const rd = repoData as Record<string, unknown>;
      await upsertRepo(ctx.database, {
        id: rd.id as number,
        fullName: rd.full_name as string,
        owner: (rd.owner as Record<string, unknown>).login as string,
        name: rd.name as string,
        private: rd.private as boolean,
        defaultBranch: rd.default_branch as string,
        htmlUrl: rd.html_url as string,
        description: rd.description as string | null,
        language: rd.language as string | null,
        topics: (rd.topics as string[]) ?? [],
        updatedAt: rd.updated_at as string,
      });

      // Sync all open PRs
      const { data: prs } = await githubFetch(
        ctx, companyId,
        `/repos/${repo.fullName}/pulls?state=open&per_page=100`,
      );
      for (const item of prs as Array<Record<string, unknown>>) {
        const pr: Omit<GitHubPR, "syncedAt"> = {
          id: item.id as number,
          repoId: repo.id,
          number: item.number as number,
          title: item.title as string,
          body: item.body as string | null,
          state: "open",
          author: (item.user as Record<string, unknown>).login as string,
          headBranch: (item.head as Record<string, unknown>).ref as string,
          baseBranch: (item.base as Record<string, unknown>).ref as string,
          htmlUrl: item.html_url as string,
          draft: item.draft as boolean,
          mergeable: item.mergeable as boolean | null,
          mergedAt: null,
          createdAt: item.created_at as string,
          updatedAt: item.updated_at as string,
        };
        await upsertPR(ctx.database, pr);
        await detectAndLinkCards(ctx, pr.id, pr.headBranch, pr.title);
        prsSynced++;
      }

      // Sync open issues
      const { data: issues } = await githubFetch(
        ctx, companyId,
        `/repos/${repo.fullName}/issues?state=open&per_page=100&filter=all`,
      );
      for (const item of (issues as Array<Record<string, unknown>>).filter((i) => !i.pull_request)) {
        const issue: Omit<GitHubIssue, "syncedAt"> = {
          id: item.id as number,
          repoId: repo.id,
          number: item.number as number,
          title: item.title as string,
          body: item.body as string | null,
          state: item.state as string,
          author: (item.user as Record<string, unknown>).login as string,
          labels: ((item.labels as Array<Record<string, unknown>>) ?? []).map((l) => l.name as string),
          htmlUrl: item.html_url as string,
          createdAt: item.created_at as string,
          updatedAt: item.updated_at as string,
        };
        await upsertIssue(ctx.database, issue);
        issuesSynced++;
      }

      reposSynced++;
    } catch (err) {
      errors.push(`${repo.fullName}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  await completeSyncLog(ctx.database, logId, { reposSynced, prsSynced, issuesSynced, errors });
  ctx.logger.info(`Full sync done: ${reposSynced} repos, ${prsSynced} PRs, ${issuesSynced} issues`);
}
```

- [ ] **Step 4: Write webhook handler test**

```ts
// tests/webhook-handler.test.ts

import { describe, it, expect, vi } from "vitest";

describe("webhook-handler", () => {
  it("ignores events without x-github-event header", async () => {
    const { handleGithubWebhook } = await import("../src/sync/webhook-handler.js");
    const ctx = mockCtx();
    await handleGithubWebhook(ctx as any, {
      endpointKey: "github-events",
      headers: {},
      rawBody: "{}",
      parsedBody: {},
      requestId: "req-1",
    });
    expect(ctx.database.mutate).not.toHaveBeenCalled();
  });

  it("processes pull_request event and upserts", async () => {
    const { handleGithubWebhook } = await import("../src/sync/webhook-handler.js");
    const ctx = mockCtx();
    await handleGithubWebhook(ctx as any, {
      endpointKey: "github-events",
      headers: { "x-github-event": "pull_request" },
      rawBody: "",
      parsedBody: {
        action: "opened",
        pull_request: {
          id: 1, number: 42, title: "CARD-10 fix", body: null,
          state: "open", draft: false, mergeable: true, merged: false,
          merged_at: null, created_at: "2026-01-01", updated_at: "2026-01-01",
          html_url: "https://github.com/org/repo/pull/42",
          user: { login: "dev" },
          head: { ref: "CARD-10-fix" },
          base: { ref: "main" },
        },
        repository: {
          id: 100, full_name: "org/repo", name: "repo",
          private: false, default_branch: "main",
          html_url: "https://github.com/org/repo",
          description: null, language: "TypeScript",
          topics: [], updated_at: "2026-01-01",
          owner: { login: "org" },
        },
      },
      requestId: "req-2",
    });
    // Should have called mutate for repo upsert, PR upsert, and link
    expect(ctx.database.mutate).toHaveBeenCalled();
  });
});

function mockCtx() {
  return {
    database: {
      query: vi.fn(async () => []),
      mutate: vi.fn(async () => undefined),
    },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    http: { fetch: vi.fn() },
    state: { get: vi.fn(), set: vi.fn() },
    secrets: { resolve: vi.fn() },
  };
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/webhook-handler.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/sync/ tests/webhook-handler.test.ts
git commit -m "feat: add 3-layer sync engine (webhook, incremental, full)"
```

---

## Task 6: Review Tools (Agent Integration)

**Files:**
- Create: `src/review/review-tools.ts`
- Create: `src/review/quick-check.ts`
- Test: `tests/review-tools.test.ts`
- Test: `tests/quick-check.test.ts`

- [ ] **Step 1: Create review tools**

```ts
// src/review/review-tools.ts

import type { PluginContext } from "@paperclipai/plugin-sdk";
import { githubFetch } from "../github/api-client.js";

const MAX_DIFF_CHARS = 120_000;
const MAX_FILE_CHARS = 128_000;

export function registerReviewTools(ctx: PluginContext): void {
  ctx.tools.register("github_get_pull_request_diff", {
    description: "Get the diff of a GitHub pull request for code review",
    parameters: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner" },
        repo: { type: "string", description: "Repository name" },
        pull_number: { type: "number", description: "PR number" },
      },
      required: ["owner", "repo", "pull_number"],
    },
    handler: async (params, runCtx) => {
      const { owner, repo, pull_number } = params as { owner: string; repo: string; pull_number: number };
      const companyId = runCtx.companyId;
      if (!companyId) return { error: "No company context" };

      const { data: prData } = await githubFetch(ctx, companyId, `/repos/${owner}/${repo}/pulls/${pull_number}`);
      const pr = prData as Record<string, unknown>;

      const { data: diffData } = await githubFetch(
        ctx, companyId,
        `/repos/${owner}/${repo}/pulls/${pull_number}`,
        { accept: "application/vnd.github.v3.diff" },
      );

      let diff = String(diffData);
      let truncated = false;
      if (diff.length > MAX_DIFF_CHARS) {
        diff = diff.slice(0, MAX_DIFF_CHARS);
        truncated = true;
      }

      const { data: filesData } = await githubFetch(
        ctx, companyId,
        `/repos/${owner}/${repo}/pulls/${pull_number}/files?per_page=100`,
      );
      const files = (filesData as Array<Record<string, unknown>>).map((f) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
      }));

      return {
        content: `PR #${pull_number}: ${pr.title}\nAuthor: ${(pr.user as Record<string, unknown>).login}\nFiles changed: ${files.length}${truncated ? "\n⚠️ Diff truncated" : ""}\n\n${diff}`,
        data: { pr: { title: pr.title, number: pull_number, sha: (pr.head as Record<string, unknown>).sha }, files },
      };
    },
  });

  ctx.tools.register("github_read_file_content", {
    description: "Read a file from a GitHub repository",
    parameters: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        path: { type: "string", description: "File path in the repository" },
        ref: { type: "string", description: "Branch, tag, or commit SHA (optional)" },
      },
      required: ["owner", "repo", "path"],
    },
    handler: async (params, runCtx) => {
      const { owner, repo, path, ref } = params as { owner: string; repo: string; path: string; ref?: string };
      const companyId = runCtx.companyId;
      if (!companyId) return { error: "No company context" };

      const refParam = ref ? `?ref=${ref}` : "";
      const { data } = await githubFetch(
        ctx, companyId,
        `/repos/${owner}/${repo}/contents/${path}${refParam}`,
      );

      const file = data as Record<string, unknown>;
      const content = Buffer.from(file.content as string, "base64").toString("utf-8");
      const truncated = content.length > MAX_FILE_CHARS;

      return {
        content: truncated ? content.slice(0, MAX_FILE_CHARS) + "\n⚠️ Truncated" : content,
        data: { path, size: file.size, sha: file.sha },
      };
    },
  });

  ctx.tools.register("github_create_review_comment", {
    description: "Add an inline review comment to a pull request",
    parameters: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        pull_number: { type: "number" },
        commit_id: { type: "string", description: "The SHA of the PR head commit" },
        path: { type: "string", description: "File path relative to repo root" },
        line: { type: "number", description: "Line number in the diff" },
        body: { type: "string", description: "Comment text (markdown)" },
      },
      required: ["owner", "repo", "pull_number", "commit_id", "path", "line", "body"],
    },
    handler: async (params, runCtx) => {
      const { owner, repo, pull_number, commit_id, path, line, body } = params as {
        owner: string; repo: string; pull_number: number;
        commit_id: string; path: string; line: number; body: string;
      };
      const companyId = runCtx.companyId;
      if (!companyId) return { error: "No company context" };

      await githubFetch(ctx, companyId, `/repos/${owner}/${repo}/pulls/${pull_number}/comments`, {
        method: "POST",
        body: { commit_id, path, line, body, side: "RIGHT" },
      });

      return { content: `Comment added to ${path}:${line}` };
    },
  });

  ctx.tools.register("github_submit_pr_review", {
    description: "Submit a pull request review with a verdict",
    parameters: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        pull_number: { type: "number" },
        event: { type: "string", enum: ["APPROVE", "REQUEST_CHANGES", "COMMENT"] },
        body: { type: "string", description: "Review summary (markdown)" },
      },
      required: ["owner", "repo", "pull_number", "event", "body"],
    },
    handler: async (params, runCtx) => {
      const { owner, repo, pull_number, event, body } = params as {
        owner: string; repo: string; pull_number: number; event: string; body: string;
      };
      const companyId = runCtx.companyId;
      if (!companyId) return { error: "No company context" };

      await githubFetch(ctx, companyId, `/repos/${owner}/${repo}/pulls/${pull_number}/reviews`, {
        method: "POST",
        body: { event, body },
      });

      return { content: `Review submitted: ${event}`, data: { event } };
    },
  });

  ctx.tools.register("github_list_repositories", {
    description: "List tracked GitHub repositories",
    parameters: { type: "object", properties: {} },
    handler: async (_params, _runCtx) => {
      const { listRepos } = await import("../db/queries.js");
      const repos = await listRepos(ctx.database);
      return {
        content: repos.map((r) => `${r.fullName} (${r.language ?? "unknown"})`).join("\n"),
        data: { repos },
      };
    },
  });

  ctx.tools.register("github_search_issues", {
    description: "Search GitHub issues and PRs using GitHub search syntax",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "GitHub search query (e.g. 'is:open label:bug')" },
      },
      required: ["query"],
    },
    handler: async (params, runCtx) => {
      const { query } = params as { query: string };
      const companyId = runCtx.companyId;
      if (!companyId) return { error: "No company context" };

      const { data } = await githubFetch(
        ctx, companyId,
        `/search/issues?q=${encodeURIComponent(query)}&per_page=20`,
      );
      const result = data as Record<string, unknown>;
      const items = (result.items as Array<Record<string, unknown>>).map((i) => ({
        title: i.title, number: i.number, state: i.state, html_url: i.html_url,
      }));

      return { content: items.map((i) => `#${i.number} ${i.title} [${i.state}]`).join("\n"), data: { items } };
    },
  });
}
```

- [ ] **Step 2: Create quick check**

```ts
// src/review/quick-check.ts

import type { PluginContext } from "@paperclipai/plugin-sdk";
import { githubFetch } from "../github/api-client.js";
import type { QuickCheckResult } from "../types.js";

const SENSITIVE_PATTERNS = [
  /\.env$/i,
  /\.env\./i,
  /credentials/i,
  /secret/i,
  /\.pem$/i,
  /\.key$/i,
  /password/i,
  /token/i,
];

const TEST_PATTERNS = [
  /\.test\./,
  /\.spec\./,
  /_test\./,
  /tests?\//,
  /__tests__\//,
];

export async function runQuickCheck(
  ctx: PluginContext,
  companyId: string,
  owner: string,
  repo: string,
  pullNumber: number,
): Promise<QuickCheckResult> {
  const { data: prData } = await githubFetch(ctx, companyId, `/repos/${owner}/${repo}/pulls/${pullNumber}`);
  const pr = prData as Record<string, unknown>;

  const { data: filesData } = await githubFetch(
    ctx, companyId,
    `/repos/${owner}/${repo}/pulls/${pullNumber}/files?per_page=100`,
  );
  const files = filesData as Array<Record<string, unknown>>;
  const filenames = files.map((f) => f.filename as string);

  const hasDescription = Boolean(pr.body && (pr.body as string).trim().length > 10);

  const hasTests = filenames.some((f) =>
    TEST_PATTERNS.some((pattern) => pattern.test(f)),
  );

  const sensitiveFiles = filenames.filter((f) =>
    SENSITIVE_PATTERNS.some((pattern) => pattern.test(f)),
  );

  return {
    hasDescription,
    hasTests,
    sensitiveFiles,
    checkedAt: new Date().toISOString(),
  };
}
```

- [ ] **Step 3: Write quick check tests**

```ts
// tests/quick-check.test.ts

import { describe, it, expect } from "vitest";

// Test the pattern matching logic inline since runQuickCheck needs ctx
describe("quick-check patterns", () => {
  const SENSITIVE_PATTERNS = [
    /\.env$/i, /\.env\./i, /credentials/i, /secret/i,
    /\.pem$/i, /\.key$/i, /password/i, /token/i,
  ];
  const TEST_PATTERNS = [
    /\.test\./, /\.spec\./, /_test\./, /tests?\//, /__tests__\//,
  ];

  it("detects .env files as sensitive", () => {
    expect(SENSITIVE_PATTERNS.some((p) => p.test(".env"))).toBe(true);
    expect(SENSITIVE_PATTERNS.some((p) => p.test(".env.local"))).toBe(true);
  });

  it("detects .pem and .key as sensitive", () => {
    expect(SENSITIVE_PATTERNS.some((p) => p.test("server.pem"))).toBe(true);
    expect(SENSITIVE_PATTERNS.some((p) => p.test("private.key"))).toBe(true);
  });

  it("does not flag normal files as sensitive", () => {
    expect(SENSITIVE_PATTERNS.some((p) => p.test("index.ts"))).toBe(false);
    expect(SENSITIVE_PATTERNS.some((p) => p.test("README.md"))).toBe(false);
  });

  it("detects test files", () => {
    expect(TEST_PATTERNS.some((p) => p.test("foo.test.ts"))).toBe(true);
    expect(TEST_PATTERNS.some((p) => p.test("foo.spec.ts"))).toBe(true);
    expect(TEST_PATTERNS.some((p) => p.test("tests/bar.ts"))).toBe(true);
    expect(TEST_PATTERNS.some((p) => p.test("__tests__/baz.ts"))).toBe(true);
  });

  it("does not flag normal files as tests", () => {
    expect(TEST_PATTERNS.some((p) => p.test("app.ts"))).toBe(false);
  });
});
```

- [ ] **Step 4: Write review tools test**

```ts
// tests/review-tools.test.ts

import { describe, it, expect, vi } from "vitest";

describe("review-tools", () => {
  it("registerReviewTools registers 6 tools", async () => {
    const registered: string[] = [];
    const ctx = {
      tools: {
        register: vi.fn((name: string) => { registered.push(name); }),
      },
    };

    const { registerReviewTools } = await import("../src/review/review-tools.js");
    registerReviewTools(ctx as any);

    expect(registered).toEqual([
      "github_get_pull_request_diff",
      "github_read_file_content",
      "github_create_review_comment",
      "github_submit_pr_review",
      "github_list_repositories",
      "github_search_issues",
    ]);
  });
});
```

- [ ] **Step 5: Run all tests**

Run: `npx vitest run tests/review-tools.test.ts tests/quick-check.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/review/ tests/review-tools.test.ts tests/quick-check.test.ts
git commit -m "feat: add agent review tools and automated quick check"
```

---

## Task 7: Graphify Integration

**Files:**
- Create: `src/graphify/graph-generator.ts`

- [ ] **Step 1: Create graph generator**

```ts
// src/graphify/graph-generator.ts

import type { PluginContext } from "@paperclipai/plugin-sdk";
import { githubFetch } from "../github/api-client.js";
import { listRepos, listPRs } from "../db/queries.js";
import type { GitHubRepo, PRWithRepo } from "../types.js";

export type GraphNode = {
  id: string;
  label: string;
  type: "repo" | "pr" | "file" | "module" | "agent";
  metadata: Record<string, unknown>;
};

export type GraphEdge = {
  source: string;
  target: string;
  label: string;
  type: "dependency" | "pr_target" | "contains" | "reviews";
};

export type GraphData = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  generatedAt: string;
  repoFullName: string;
  level: "high" | "code";
};

export async function generateHighLevelGraph(
  ctx: PluginContext,
  companyId: string,
): Promise<GraphData> {
  const repos = await listRepos(ctx.database);
  const prs = await listPRs(ctx.database, { state: "open" });

  const nodes: GraphNode[] = repos.map((r) => ({
    id: `repo:${r.fullName}`,
    label: r.fullName,
    type: "repo" as const,
    metadata: { language: r.language, private: r.private, defaultBranch: r.defaultBranch },
  }));

  const edges: GraphEdge[] = [];

  // PRs as edges between repos (cross-repo) or self-loops (same-repo)
  for (const pr of prs) {
    const prNode: GraphNode = {
      id: `pr:${pr.repoFullName}#${pr.number}`,
      label: `#${pr.number}: ${pr.title}`,
      type: "pr",
      metadata: { state: pr.state, author: pr.author, draft: pr.draft },
    };
    nodes.push(prNode);
    edges.push({
      source: prNode.id,
      target: `repo:${pr.repoFullName}`,
      label: `${pr.headBranch} → ${pr.baseBranch}`,
      type: "pr_target",
    });
  }

  return {
    nodes,
    edges,
    generatedAt: new Date().toISOString(),
    repoFullName: "*",
    level: "high",
  };
}

export async function generateCodeGraph(
  ctx: PluginContext,
  companyId: string,
  repoFullName: string,
): Promise<GraphData> {
  // Fetch repo tree (top 2 levels)
  const { data } = await githubFetch(
    ctx, companyId,
    `/repos/${repoFullName}/git/trees/HEAD?recursive=1`,
  );

  const tree = (data as Record<string, unknown>).tree as Array<Record<string, unknown>>;

  const nodes: GraphNode[] = [{
    id: `repo:${repoFullName}`,
    label: repoFullName,
    type: "repo",
    metadata: {},
  }];

  const edges: GraphEdge[] = [];

  // Build module nodes from directories and file nodes
  const dirs = new Set<string>();

  for (const entry of tree) {
    const path = entry.path as string;
    const type = entry.type as string;

    if (type === "tree") {
      // Directory = module
      const depth = path.split("/").length;
      if (depth <= 3) {
        dirs.add(path);
        nodes.push({
          id: `dir:${repoFullName}/${path}`,
          label: path,
          type: "module",
          metadata: { depth },
        });

        const parentDir = path.split("/").slice(0, -1).join("/");
        const parentId = parentDir
          ? `dir:${repoFullName}/${parentDir}`
          : `repo:${repoFullName}`;
        edges.push({
          source: parentId,
          target: `dir:${repoFullName}/${path}`,
          label: "contains",
          type: "contains",
        });
      }
    } else if (type === "blob") {
      // Only include top-level config files and key source files
      const depth = path.split("/").length;
      if (depth <= 2 || /\.(json|ya?ml|toml|lock)$/.test(path)) {
        nodes.push({
          id: `file:${repoFullName}/${path}`,
          label: path.split("/").pop()!,
          type: "file",
          metadata: { path, size: entry.size },
        });

        const parentDir = path.split("/").slice(0, -1).join("/");
        const parentId = parentDir
          ? `dir:${repoFullName}/${parentDir}`
          : `repo:${repoFullName}`;
        edges.push({
          source: parentId,
          target: `file:${repoFullName}/${path}`,
          label: "contains",
          type: "contains",
        });
      }
    }
  }

  return {
    nodes,
    edges,
    generatedAt: new Date().toISOString(),
    repoFullName,
    level: "code",
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/graphify/
git commit -m "feat: add graphify integration for high-level and code-level graphs"
```

---

## Task 8: Manifest

**Files:**
- Create: `src/manifest.ts`

- [ ] **Step 1: Write the full manifest**

```ts
// src/manifest.ts

import type { PluginManifest } from "@paperclipai/plugin-sdk";

export const manifest: PluginManifest = {
  id: "cus.github-manager",
  version: "1.0.0",
  apiVersion: 1,
  displayName: "GitHub Manager",
  description: "Manage GitHub repos, PRs, issues, agent code reviews, and knowledge graphs — all from Paperclip",
  author: "Gaud ERP",
  categories: ["connector", "automation"],

  capabilities: [
    "config",
    "events.subscribe",
    "events.emit",
    "http.request",
    "secrets.resolve",
    "state.read",
    "state.write",
    "database.query",
    "database.mutate",
    "jobs.schedule",
    "webhooks.receive",
    "tools.register",
    "agents.managed.reconcile",
    "agents.invoke",
    "issues.read",
    "ui.page.register",
    "ui.sidebar.register",
    "ui.detailTab.register",
    "ui.dashboardWidget.register",
    "ui.contextMenuItem.register",
    "logging",
  ],

  worker: { source: "./dist/worker.js" },
  ui: { source: "./dist/ui" },

  database: {
    migrationsDir: "src/db/migrations",
  },

  jobs: [
    {
      jobKey: "sync-github",
      displayName: "Sync GitHub PRs and Issues",
      schedule: "*/5 * * * *",
      description: "Incremental sync of open PRs and issues for tracked repositories",
    },
  ],

  webhooks: [
    {
      endpointKey: "github-events",
      description: "Receives GitHub webhook events (pull_request, issues)",
      events: ["pull_request", "issues"],
    },
  ],

  tools: [
    {
      toolKey: "github_get_pull_request_diff",
      displayName: "Get PR Diff",
      description: "Retrieve the unified diff of a GitHub pull request",
    },
    {
      toolKey: "github_read_file_content",
      displayName: "Read File",
      description: "Read a file from a GitHub repository",
    },
    {
      toolKey: "github_create_review_comment",
      displayName: "Add Review Comment",
      description: "Post an inline review comment on a pull request",
    },
    {
      toolKey: "github_submit_pr_review",
      displayName: "Submit PR Review",
      description: "Submit a review verdict (approve, request changes, comment)",
    },
    {
      toolKey: "github_list_repositories",
      displayName: "List Repositories",
      description: "List all tracked GitHub repositories",
    },
    {
      toolKey: "github_search_issues",
      displayName: "Search Issues",
      description: "Search GitHub issues and PRs using search syntax",
    },
  ],

  agents: [
    {
      agentKey: "github-reviewer",
      displayName: "GitHub Code Reviewer",
      role: "code-review",
      title: "Senior Code Reviewer",
    },
  ],

  ui_slots: [
    // Sidebar
    {
      slot: "sidebar",
      exportName: "GitHubSidebarLink",
      displayName: "GitHub",
    },
    {
      slot: "sidebarPanel",
      exportName: "GitHubSidebarPanel",
      displayName: "GitHub Quick View",
    },
    // Pages
    {
      slot: "page",
      exportName: "GitHubSettingsPage",
      displayName: "Configurações GitHub",
      routePath: "github-settings",
    },
    {
      slot: "routeSidebar",
      exportName: "GitHubRouteSidebar",
      displayName: "GitHub Navigation",
      routePaths: ["github-settings", "github-repos", "github-prs", "github-graphs"],
    },
    {
      slot: "page",
      exportName: "GitHubReposPage",
      displayName: "Repositórios",
      routePath: "github-repos",
    },
    {
      slot: "page",
      exportName: "GitHubPullRequestsPage",
      displayName: "Pull Requests",
      routePath: "github-prs",
    },
    {
      slot: "page",
      exportName: "GitHubGraphsPage",
      displayName: "Knowledge Graphs",
      routePath: "github-graphs",
    },
    // Dashboard
    {
      slot: "dashboardWidget",
      exportName: "GitHubDashboardWidget",
      displayName: "GitHub Status",
    },
    // Detail tab inside cards
    {
      slot: "detailTab",
      exportName: "GitHubDetailTab",
      displayName: "GitHub",
      entityTypes: ["issue"],
    },
    // Context menu on repos
    {
      slot: "contextMenuItem",
      exportName: "GitHubContextMenu",
      displayName: "GitHub Actions",
    },
  ],
};
```

- [ ] **Step 2: Commit**

```bash
git add src/manifest.ts
git commit -m "feat: add plugin manifest with all capabilities, slots, tools, and agents"
```

---

## Task 9: Worker (Plugin Entry Point)

**Files:**
- Create: `src/worker.ts`

- [ ] **Step 1: Write the worker**

```ts
// src/worker.ts

import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import { registerReviewTools } from "./review/review-tools.js";
import { handleGithubWebhook } from "./sync/webhook-handler.js";
import { runIncrementalSync } from "./sync/incremental-sync.js";
import { runFullSync } from "./sync/full-sync.js";
import { runQuickCheck } from "./review/quick-check.js";
import { generateHighLevelGraph, generateCodeGraph } from "./graphify/graph-generator.js";
import {
  listRepos, listPRs, getLinksForCard,
  getLastSyncTime, upsertRepo, linkPRToCard,
  getRepoByFullName,
} from "./db/queries.js";
import { saveGithubPAT, saveGithubSecretRef, resolveGithubToken } from "./github/config.js";
import { githubFetch } from "./github/api-client.js";

const plugin = definePlugin({
  async setup(ctx) {
    ctx.logger.info("GitHub Manager v2 starting");

    // ── Tools ──
    registerReviewTools(ctx);

    // ── Webhook ──
    // Handled via onWebhook lifecycle

    // ── Jobs ──
    ctx.jobs.register("sync-github", async (job) => {
      ctx.logger.info("Running scheduled incremental sync");
      const companies = await ctx.companies.list();
      for (const company of companies) {
        try {
          await runIncrementalSync(ctx, company.id);
        } catch (err) {
          ctx.logger.error(`Sync failed for company ${company.id}: ${err}`);
        }
      }
    });

    // ── Data handlers (UI reads) ──

    ctx.data.register("repos", async ({ companyId }) => {
      const repos = await listRepos(ctx.database);
      const lastSync = await getLastSyncTime(ctx.database);
      return { repos, lastSync };
    });

    ctx.data.register("pull-requests", async ({ companyId, filters }) => {
      const f = filters as { repoId?: number; state?: string; author?: string } | undefined;
      const prs = await listPRs(ctx.database, f);
      return { pullRequests: prs };
    });

    ctx.data.register("card-prs", async ({ companyId, issueId }) => {
      const prs = await getLinksForCard(ctx.database, issueId as string);
      return { pullRequests: prs };
    });

    ctx.data.register("sync-status", async () => {
      const lastSync = await getLastSyncTime(ctx.database);
      const repos = await listRepos(ctx.database);
      const openPRs = await listPRs(ctx.database, { state: "open" });
      return {
        lastSync,
        repoCount: repos.length,
        openPRCount: openPRs.length,
      };
    });

    ctx.data.register("graph-data", async ({ companyId, repoFullName, level }) => {
      if (level === "high") {
        return await generateHighLevelGraph(ctx, companyId as string);
      }
      return await generateCodeGraph(ctx, companyId as string, repoFullName as string);
    });

    ctx.data.register("available-agents", async ({ companyId }) => {
      // List agents available for review
      const agents = await ctx.agents.list({ companyId: companyId as string });
      return { agents };
    });

    // ── Action handlers (UI writes) ──

    ctx.actions.register("save-token", async ({ companyId, token }) => {
      await saveGithubPAT(ctx, companyId as string, token as string);
      return { ok: true };
    });

    ctx.actions.register("save-secret-ref", async ({ companyId, secretRef }) => {
      await saveGithubSecretRef(ctx, companyId as string, secretRef as string);
      return { ok: true };
    });

    ctx.actions.register("test-connection", async ({ companyId }) => {
      try {
        const token = await resolveGithubToken(ctx, companyId as string);
        const { data } = await githubFetch(ctx, companyId as string, "/user");
        const user = data as Record<string, unknown>;
        return { ok: true, login: user.login };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    });

    ctx.actions.register("add-repo", async ({ companyId, fullName }) => {
      const { data } = await githubFetch(ctx, companyId as string, `/repos/${fullName}`);
      const rd = data as Record<string, unknown>;
      await upsertRepo(ctx.database, {
        id: rd.id as number,
        fullName: rd.full_name as string,
        owner: (rd.owner as Record<string, unknown>).login as string,
        name: rd.name as string,
        private: rd.private as boolean,
        defaultBranch: rd.default_branch as string,
        htmlUrl: rd.html_url as string,
        description: rd.description as string | null,
        language: rd.language as string | null,
        topics: (rd.topics as string[]) ?? [],
        updatedAt: rd.updated_at as string,
      });
      return { ok: true };
    });

    ctx.actions.register("sync-all", async ({ companyId }) => {
      await runFullSync(ctx, companyId as string);
      return { ok: true };
    });

    ctx.actions.register("sync-incremental", async ({ companyId }) => {
      await runIncrementalSync(ctx, companyId as string);
      return { ok: true };
    });

    ctx.actions.register("link-pr-to-card", async ({ prId, issueId }) => {
      await linkPRToCard(ctx.database, prId as number, issueId as string, "manual");
      return { ok: true };
    });

    ctx.actions.register("request-review", async ({ companyId, prId, repoFullName, prNumber, agentId }) => {
      const repo = await getRepoByFullName(ctx.database, repoFullName as string);
      if (!repo) throw new Error(`Repo ${repoFullName} not found`);

      const [owner, repoName] = (repoFullName as string).split("/");

      await ctx.agents.invoke({
        agentId: agentId as string,
        companyId: companyId as string,
        message: `Please review PR #${prNumber} in ${repoFullName}. Use the github_get_pull_request_diff tool with owner="${owner}", repo="${repoName}", pull_number=${prNumber} to get the diff, then provide a thorough code review. Post your findings as inline comments using github_create_review_comment and submit your final verdict using github_submit_pr_review.`,
      });

      return { ok: true };
    });

    ctx.actions.register("run-quick-check", async ({ companyId, repoFullName, prNumber }) => {
      const [owner, repo] = (repoFullName as string).split("/");
      const result = await runQuickCheck(ctx, companyId as string, owner, repo, prNumber as number);
      return result;
    });

    ctx.actions.register("generate-graph", async ({ companyId, repoFullName, level }) => {
      if (level === "high") {
        return await generateHighLevelGraph(ctx, companyId as string);
      }
      return await generateCodeGraph(ctx, companyId as string, repoFullName as string);
    });

    // ── Managed agent reconciliation ──
    ctx.events.on("company.created", async (event) => {
      await ctx.agents.managed.reconcile(event.payload.companyId);
    });
  },

  async onHealth() {
    return { status: "ok", message: "GitHub Manager v2 running" };
  },

  async onWebhook(input) {
    // Access ctx via closure — this is called by the host
    // The plugin SDK provides the context through the lifecycle
    // We delegate to the webhook handler
    return;
  },

  async onShutdown() {
    // No cleanup needed
  },
});

export default plugin;

runWorker(plugin);
```

**Note:** The `onWebhook` handler needs access to `ctx`. The Paperclip SDK passes it through the plugin definition. We need to store `ctx` from setup:

- [ ] **Step 2: Refactor worker to store ctx reference for onWebhook**

```ts
// Refactor: store ctx reference at module level for lifecycle hooks
// Replace the plugin definition section in src/worker.ts:

let pluginCtx: import("@paperclipai/plugin-sdk").PluginContext | null = null;

const plugin = definePlugin({
  async setup(ctx) {
    pluginCtx = ctx;
    ctx.logger.info("GitHub Manager v2 starting");

    // ... (all registrations from Step 1 remain the same)
  },

  async onHealth() {
    return { status: "ok", message: "GitHub Manager v2 running" };
  },

  async onWebhook(input) {
    if (!pluginCtx) throw new Error("Plugin not initialized");
    await handleGithubWebhook(pluginCtx, input);
  },

  async onShutdown() {
    pluginCtx = null;
  },
});
```

- [ ] **Step 3: Commit**

```bash
git add src/worker.ts
git commit -m "feat: add plugin worker with all data/action/job/webhook handlers"
```

---

## Task 10: UI — Shared Styles & Sidebar

**Files:**
- Create: `src/ui/components/shared.ts`
- Create: `src/ui/components/Sidebar.tsx`

- [ ] **Step 1: Create shared styles and constants**

```ts
// src/ui/components/shared.ts

export const ROUTES = {
  settings: "github-settings",
  repos: "github-repos",
  prs: "github-prs",
  graphs: "github-graphs",
} as const;

export const PATHS = {
  settings: "/github-settings",
  repos: "/github-repos",
  prs: "/github-prs",
  graphs: "/github-graphs",
} as const;

export const layoutStack: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "12px",
  padding: "16px",
};

export const cardStyle: React.CSSProperties = {
  border: "1px solid rgba(128,128,128,0.2)",
  borderRadius: "8px",
  padding: "12px",
  background: "rgba(128,128,128,0.04)",
};

export const buttonStyle: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: "6px",
  border: "1px solid rgba(128,128,128,0.3)",
  background: "transparent",
  cursor: "pointer",
  fontSize: "13px",
};

export const primaryButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  background: "rgba(59,130,246,0.1)",
  borderColor: "rgba(59,130,246,0.3)",
  color: "#3b82f6",
};

export const badgeStyle = (color: string): React.CSSProperties => ({
  display: "inline-block",
  padding: "2px 8px",
  borderRadius: "12px",
  fontSize: "11px",
  fontWeight: 600,
  background: `${color}20`,
  color,
});

export function prStateBadge(state: string): { label: string; color: string } {
  switch (state) {
    case "open": return { label: "Open", color: "#22c55e" };
    case "closed": return { label: "Closed", color: "#ef4444" };
    case "merged": return { label: "Merged", color: "#a855f7" };
    case "draft": return { label: "Draft", color: "#6b7280" };
    default: return { label: state, color: "#6b7280" };
  }
}

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
```

- [ ] **Step 2: Create Sidebar**

```tsx
// src/ui/components/Sidebar.tsx

import React from "react";
import { useHostNavigation, usePluginData } from "@paperclipai/plugin-sdk/ui";
import { PATHS } from "./shared.js";

type NavItem = { label: string; path: string };

const NAV_ITEMS: NavItem[] = [
  { label: "Configurações", path: PATHS.settings },
  { label: "Repositórios", path: PATHS.repos },
  { label: "Pull Requests", path: PATHS.prs },
  { label: "Knowledge Graphs", path: PATHS.graphs },
];

export function GitHubSidebarLink() {
  const nav = useHostNavigation();
  const href = nav.resolveHref(PATHS.repos);
  const isActive = typeof window !== "undefined" && window.location.pathname === href;

  return (
    <a
      {...nav.linkProps(PATHS.repos)}
      aria-current={isActive ? "page" : undefined}
      className={[
        "flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium",
        isActive ? "bg-accent text-foreground" : "text-foreground/80 hover:bg-accent/50",
      ].join(" ")}
    >
      <span className="relative shrink-0">
        <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor">
          <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
        </svg>
      </span>
      <span className="flex-1 truncate">GitHub</span>
    </a>
  );
}

export function GitHubSidebarPanel() {
  const syncStatus = usePluginData<{ lastSync: string | null; repoCount: number; openPRCount: number }>("sync-status");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px", padding: "8px" }}>
      <strong>GitHub</strong>
      <div>Repos: {syncStatus.data?.repoCount ?? 0}</div>
      <div>PRs abertos: {syncStatus.data?.openPRCount ?? 0}</div>
      <div>Último sync: {syncStatus.data?.lastSync ? new Date(syncStatus.data.lastSync).toLocaleString() : "nunca"}</div>
    </div>
  );
}

export function GitHubRouteSidebar() {
  const nav = useHostNavigation();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2px", padding: "4px" }}>
      {NAV_ITEMS.map((item) => {
        const href = nav.resolveHref(item.path);
        const isActive = typeof window !== "undefined" && window.location.pathname === href;
        return (
          <a
            key={item.path}
            {...nav.linkProps(item.path)}
            aria-current={isActive ? "page" : undefined}
            style={{
              display: "block",
              padding: "6px 12px",
              borderRadius: "6px",
              fontSize: "13px",
              fontWeight: isActive ? 600 : 400,
              background: isActive ? "rgba(128,128,128,0.1)" : "transparent",
              textDecoration: "none",
              color: "inherit",
            }}
          >
            {item.label}
          </a>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/ui/components/shared.ts src/ui/components/Sidebar.tsx
git commit -m "feat: add shared UI styles and sidebar navigation"
```

---

## Task 11: UI — Settings Page

**Files:**
- Create: `src/ui/components/SettingsPage.tsx`

- [ ] **Step 1: Create settings page**

```tsx
// src/ui/components/SettingsPage.tsx

import React, { useState } from "react";
import { useHostContext, usePluginAction } from "@paperclipai/plugin-sdk/ui";
import { layoutStack, cardStyle, buttonStyle, primaryButtonStyle } from "./shared.js";

export function GitHubSettingsPage() {
  const context = useHostContext();
  const companyId = context.companyId;

  const [token, setToken] = useState("");
  const [secretRef, setSecretRef] = useState("");
  const [repoInput, setRepoInput] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const saveToken = usePluginAction("save-token");
  const saveSecretRefAction = usePluginAction("save-secret-ref");
  const testConnection = usePluginAction("test-connection");
  const addRepo = usePluginAction("add-repo");
  const syncAll = usePluginAction("sync-all");

  if (!companyId) return <div style={layoutStack}>Selecione uma empresa.</div>;

  const handleSaveToken = async () => {
    if (!token.trim()) return;
    setLoading(true);
    try {
      await saveToken({ companyId, token: token.trim() });
      setStatus("Token salvo com sucesso");
      setToken("");
    } catch (err) {
      setStatus(`Erro: ${err}`);
    }
    setLoading(false);
  };

  const handleSaveSecretRef = async () => {
    if (!secretRef.trim()) return;
    setLoading(true);
    try {
      await saveSecretRefAction({ companyId, secretRef: secretRef.trim() });
      setStatus("Secret ref salvo com sucesso");
      setSecretRef("");
    } catch (err) {
      setStatus(`Erro: ${err}`);
    }
    setLoading(false);
  };

  const handleTestConnection = async () => {
    setLoading(true);
    try {
      const result = await testConnection({ companyId }) as { ok: boolean; login?: string; error?: string };
      if (result.ok) {
        setStatus(`Conectado como ${result.login}`);
      } else {
        setStatus(`Falha: ${result.error}`);
      }
    } catch (err) {
      setStatus(`Erro: ${err}`);
    }
    setLoading(false);
  };

  const handleAddRepo = async () => {
    if (!repoInput.trim()) return;
    setLoading(true);
    try {
      await addRepo({ companyId, fullName: repoInput.trim() });
      setStatus(`Repositório ${repoInput.trim()} adicionado`);
      setRepoInput("");
    } catch (err) {
      setStatus(`Erro: ${err}`);
    }
    setLoading(false);
  };

  const handleFullSync = async () => {
    setLoading(true);
    setStatus("Sincronizando...");
    try {
      await syncAll({ companyId });
      setStatus("Sync completo finalizado");
    } catch (err) {
      setStatus(`Erro no sync: ${err}`);
    }
    setLoading(false);
  };

  return (
    <div style={layoutStack}>
      <h2 style={{ margin: 0, fontSize: "18px" }}>Configurações GitHub</h2>

      {status && (
        <div style={{ ...cardStyle, fontSize: "13px", color: status.startsWith("Erro") ? "#ef4444" : "#22c55e" }}>
          {status}
        </div>
      )}

      {/* Token */}
      <div style={cardStyle}>
        <h3 style={{ margin: "0 0 8px", fontSize: "14px" }}>Autenticação</h3>
        <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
          <input
            type="password"
            placeholder="GitHub Personal Access Token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            style={{ flex: 1, padding: "6px 10px", borderRadius: "6px", border: "1px solid rgba(128,128,128,0.3)", background: "transparent", fontSize: "13px" }}
          />
          <button type="button" style={buttonStyle} onClick={handleSaveToken} disabled={loading}>
            Salvar PAT
          </button>
        </div>
        <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
          <input
            placeholder="UUID do secret (alternativa)"
            value={secretRef}
            onChange={(e) => setSecretRef(e.target.value)}
            style={{ flex: 1, padding: "6px 10px", borderRadius: "6px", border: "1px solid rgba(128,128,128,0.3)", background: "transparent", fontSize: "13px" }}
          />
          <button type="button" style={buttonStyle} onClick={handleSaveSecretRef} disabled={loading}>
            Salvar Ref
          </button>
        </div>
        <button type="button" style={primaryButtonStyle} onClick={handleTestConnection} disabled={loading}>
          Testar Conexão
        </button>
      </div>

      {/* Add repo */}
      <div style={cardStyle}>
        <h3 style={{ margin: "0 0 8px", fontSize: "14px" }}>Adicionar Repositório</h3>
        <div style={{ display: "flex", gap: "8px" }}>
          <input
            placeholder="owner/repo (ex: gauderp/gaud-erp-api)"
            value={repoInput}
            onChange={(e) => setRepoInput(e.target.value)}
            style={{ flex: 1, padding: "6px 10px", borderRadius: "6px", border: "1px solid rgba(128,128,128,0.3)", background: "transparent", fontSize: "13px" }}
          />
          <button type="button" style={primaryButtonStyle} onClick={handleAddRepo} disabled={loading}>
            Adicionar
          </button>
        </div>
      </div>

      {/* Sync */}
      <div style={cardStyle}>
        <h3 style={{ margin: "0 0 8px", fontSize: "14px" }}>Sincronização</h3>
        <p style={{ margin: "0 0 8px", fontSize: "12px", opacity: 0.7 }}>
          Sync automático a cada 5 minutos. Use o botão abaixo para forçar um sync completo.
        </p>
        <button type="button" style={primaryButtonStyle} onClick={handleFullSync} disabled={loading}>
          {loading ? "Sincronizando..." : "Sync Completo"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/components/SettingsPage.tsx
git commit -m "feat: add settings page with token config, repo add, and sync"
```

---

## Task 12: UI — Repos Page

**Files:**
- Create: `src/ui/components/ReposPage.tsx`

- [ ] **Step 1: Create repos page**

```tsx
// src/ui/components/ReposPage.tsx

import React, { useState } from "react";
import { useHostContext, usePluginData, usePluginAction } from "@paperclipai/plugin-sdk/ui";
import { layoutStack, cardStyle, buttonStyle, primaryButtonStyle, timeAgo } from "./shared.js";
import type { GitHubRepo } from "../../types.js";

export function GitHubReposPage() {
  const context = useHostContext();
  const companyId = context.companyId;
  const [filter, setFilter] = useState("");

  const reposData = usePluginData<{ repos: GitHubRepo[]; lastSync: string | null }>("repos", { companyId });
  const syncAction = usePluginAction("sync-incremental");
  const generateGraph = usePluginAction("generate-graph");

  if (!companyId) return <div style={layoutStack}>Selecione uma empresa.</div>;

  const repos = (reposData.data?.repos ?? []).filter((r) =>
    !filter || r.fullName.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div style={layoutStack}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0, fontSize: "18px" }}>Repositórios ({repos.length})</h2>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <span style={{ fontSize: "11px", opacity: 0.6 }}>
            Último sync: {reposData.data?.lastSync ? timeAgo(reposData.data.lastSync) : "nunca"}
          </span>
          <button
            type="button"
            style={buttonStyle}
            onClick={() => syncAction({ companyId }).catch(console.error)}
          >
            Sync
          </button>
        </div>
      </div>

      <input
        placeholder="Filtrar repositórios..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid rgba(128,128,128,0.3)", background: "transparent", fontSize: "13px" }}
      />

      {repos.length === 0 && (
        <div style={{ ...cardStyle, textAlign: "center", opacity: 0.6 }}>
          Nenhum repositório rastreado. Adicione em Configurações.
        </div>
      )}

      {repos.map((repo) => (
        <div key={repo.id} style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <a href={repo.htmlUrl} target="_blank" rel="noopener" style={{ fontWeight: 600, fontSize: "14px", color: "#3b82f6", textDecoration: "none" }}>
                {repo.fullName}
              </a>
              {repo.private && <span style={{ marginLeft: "8px", fontSize: "11px", opacity: 0.5 }}>privado</span>}
              {repo.description && <p style={{ margin: "4px 0 0", fontSize: "12px", opacity: 0.7 }}>{repo.description}</p>}
            </div>
            <div style={{ display: "flex", gap: "4px" }}>
              <button
                type="button"
                style={buttonStyle}
                onClick={() => generateGraph({ companyId, repoFullName: repo.fullName, level: "code" }).catch(console.error)}
                title="Gerar Knowledge Graph"
              >
                Graphify
              </button>
            </div>
          </div>
          <div style={{ display: "flex", gap: "16px", marginTop: "8px", fontSize: "11px", opacity: 0.5 }}>
            {repo.language && <span>{repo.language}</span>}
            <span>branch: {repo.defaultBranch}</span>
            <span>sync: {timeAgo(repo.syncedAt)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/components/ReposPage.tsx
git commit -m "feat: add repos page with filtering, sync, and graphify actions"
```

---

## Task 13: UI — Pull Requests Page

**Files:**
- Create: `src/ui/components/PullRequestsPage.tsx`

- [ ] **Step 1: Create pull requests page**

```tsx
// src/ui/components/PullRequestsPage.tsx

import React, { useState } from "react";
import { useHostContext, usePluginData, usePluginAction } from "@paperclipai/plugin-sdk/ui";
import { layoutStack, cardStyle, buttonStyle, badgeStyle, prStateBadge, timeAgo } from "./shared.js";
import type { PRWithRepo } from "../../types.js";

export function GitHubPullRequestsPage() {
  const context = useHostContext();
  const companyId = context.companyId;
  const [stateFilter, setStateFilter] = useState<string>("open");
  const [search, setSearch] = useState("");

  const prsData = usePluginData<{ pullRequests: PRWithRepo[] }>("pull-requests", {
    companyId,
    filters: stateFilter ? { state: stateFilter } : undefined,
  });

  const syncAction = usePluginAction("sync-incremental");

  if (!companyId) return <div style={layoutStack}>Selecione uma empresa.</div>;

  const prs = (prsData.data?.pullRequests ?? []).filter((pr) =>
    !search || pr.title.toLowerCase().includes(search.toLowerCase()) || pr.repoFullName.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div style={layoutStack}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0, fontSize: "18px" }}>Pull Requests ({prs.length})</h2>
        <button type="button" style={buttonStyle} onClick={() => syncAction({ companyId }).catch(console.error)}>
          Sync
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {["open", "closed", "merged", ""].map((state) => (
          <button
            key={state}
            type="button"
            style={{
              ...buttonStyle,
              background: stateFilter === state ? "rgba(128,128,128,0.15)" : "transparent",
              fontWeight: stateFilter === state ? 600 : 400,
            }}
            onClick={() => setStateFilter(state)}
          >
            {state || "Todos"}
          </button>
        ))}
        <input
          placeholder="Buscar por título ou repo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: "200px", padding: "6px 10px", borderRadius: "6px", border: "1px solid rgba(128,128,128,0.3)", background: "transparent", fontSize: "13px" }}
        />
      </div>

      {prs.length === 0 && (
        <div style={{ ...cardStyle, textAlign: "center", opacity: 0.6 }}>
          Nenhum PR encontrado com os filtros atuais.
        </div>
      )}

      {prs.map((pr) => {
        const badge = prStateBadge(pr.draft ? "draft" : pr.state);
        return (
          <div key={pr.id} style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={badgeStyle(badge.color)}>{badge.label}</span>
                  <a href={pr.htmlUrl} target="_blank" rel="noopener" style={{ fontWeight: 600, fontSize: "14px", color: "#3b82f6", textDecoration: "none" }}>
                    #{pr.number} {pr.title}
                  </a>
                </div>
                <div style={{ marginTop: "4px", fontSize: "12px", opacity: 0.6 }}>
                  {pr.repoFullName} · {pr.author} · {pr.headBranch} → {pr.baseBranch} · {timeAgo(pr.updatedAt)}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/components/PullRequestsPage.tsx
git commit -m "feat: add pull requests page with state filters and search"
```

---

## Task 14: UI — Detail Tab (Card Integration)

**Files:**
- Create: `src/ui/components/ReviewDropdown.tsx`
- Create: `src/ui/components/DetailTab.tsx`

- [ ] **Step 1: Create review dropdown**

```tsx
// src/ui/components/ReviewDropdown.tsx

import React, { useState } from "react";
import { usePluginData, usePluginAction } from "@paperclipai/plugin-sdk/ui";
import { buttonStyle, primaryButtonStyle } from "./shared.js";

type Agent = { id: string; displayName: string; role: string };

type Props = {
  companyId: string;
  prId: number;
  repoFullName: string;
  prNumber: number;
};

export function ReviewDropdown({ companyId, prId, repoFullName, prNumber }: Props) {
  const [open, setOpen] = useState(false);
  const [reviewing, setReviewing] = useState(false);

  const agentsData = usePluginData<{ agents: Agent[] }>("available-agents", { companyId });
  const requestReview = usePluginAction("request-review");

  const agents = agentsData.data?.agents ?? [];

  const handleReview = async (agentId: string) => {
    setReviewing(true);
    setOpen(false);
    try {
      await requestReview({ companyId, prId, repoFullName, prNumber, agentId });
    } catch (err) {
      console.error("Review request failed:", err);
    }
    setReviewing(false);
  };

  if (reviewing) {
    return <span style={{ fontSize: "12px", opacity: 0.6 }}>Revisando...</span>;
  }

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button type="button" style={primaryButtonStyle} onClick={() => setOpen(!open)}>
        Revisar ▾
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "100%", right: 0, marginTop: "4px",
          background: "var(--background, #1a1a1a)", border: "1px solid rgba(128,128,128,0.3)",
          borderRadius: "8px", padding: "4px", minWidth: "200px", zIndex: 10,
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        }}>
          {agents.length === 0 && (
            <div style={{ padding: "8px", fontSize: "12px", opacity: 0.5 }}>Nenhum agente disponível</div>
          )}
          {agents.map((agent) => (
            <button
              key={agent.id}
              type="button"
              style={{ ...buttonStyle, width: "100%", textAlign: "left", border: "none", borderRadius: "4px" }}
              onClick={() => handleReview(agent.id)}
            >
              <div style={{ fontWeight: 500 }}>{agent.displayName}</div>
              <div style={{ fontSize: "11px", opacity: 0.5 }}>{agent.role}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create detail tab**

```tsx
// src/ui/components/DetailTab.tsx

import React, { useState } from "react";
import type { PluginDetailTabProps } from "@paperclipai/plugin-sdk/ui";
import { usePluginData, usePluginAction } from "@paperclipai/plugin-sdk/ui";
import { cardStyle, buttonStyle, badgeStyle, prStateBadge, timeAgo } from "./shared.js";
import { ReviewDropdown } from "./ReviewDropdown.js";
import type { PRWithRepo } from "../../types.js";

export function GitHubDetailTab({ context }: PluginDetailTabProps) {
  const issueId = context.entityId;
  const companyId = context.companyId;
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [selectedPrId, setSelectedPrId] = useState<number | null>(null);

  const cardPRs = usePluginData<{ pullRequests: PRWithRepo[] }>("card-prs", {
    companyId,
    issueId,
  });

  const allPRs = usePluginData<{ pullRequests: PRWithRepo[] }>("pull-requests", {
    companyId,
    filters: { state: "open" },
  });

  const linkAction = usePluginAction("link-pr-to-card");
  const quickCheck = usePluginAction("run-quick-check");

  if (!companyId || !issueId) {
    return <div style={{ padding: "12px", fontSize: "13px", opacity: 0.5 }}>Sem contexto disponível.</div>;
  }

  const prs = cardPRs.data?.pullRequests ?? [];

  const handleLink = async () => {
    if (!selectedPrId) return;
    await linkAction({ prId: selectedPrId, issueId });
    setShowLinkInput(false);
    setSelectedPrId(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "12px" }}>
      {prs.length === 0 ? (
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          <p style={{ fontSize: "13px", opacity: 0.5, margin: "0 0 12px" }}>
            Nenhum PR vinculado a este card.
          </p>
          <button type="button" style={buttonStyle} onClick={() => setShowLinkInput(true)}>
            Vincular PR
          </button>
        </div>
      ) : (
        <>
          {prs.map((pr) => {
            const badge = prStateBadge(pr.draft ? "draft" : pr.state);
            return (
              <div key={pr.id} style={cardStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={badgeStyle(badge.color)}>{badge.label}</span>
                      <a href={pr.htmlUrl} target="_blank" rel="noopener" style={{ fontWeight: 600, fontSize: "13px", color: "#3b82f6", textDecoration: "none" }}>
                        #{pr.number} {pr.title}
                      </a>
                    </div>
                    <div style={{ marginTop: "4px", fontSize: "11px", opacity: 0.5 }}>
                      {pr.repoFullName} · {pr.author} · {pr.headBranch} → {pr.baseBranch} · {timeAgo(pr.updatedAt)}
                    </div>
                  </div>
                  <ReviewDropdown
                    companyId={companyId}
                    prId={pr.id}
                    repoFullName={pr.repoFullName}
                    prNumber={pr.number}
                  />
                </div>
              </div>
            );
          })}
          <button type="button" style={{ ...buttonStyle, alignSelf: "flex-start", fontSize: "12px" }} onClick={() => setShowLinkInput(true)}>
            + Vincular outro PR
          </button>
        </>
      )}

      {/* Link PR modal inline */}
      {showLinkInput && (
        <div style={cardStyle}>
          <div style={{ fontSize: "13px", fontWeight: 500, marginBottom: "8px" }}>Selecionar PR</div>
          <select
            style={{ width: "100%", padding: "6px", borderRadius: "6px", border: "1px solid rgba(128,128,128,0.3)", background: "transparent", fontSize: "13px", marginBottom: "8px" }}
            onChange={(e) => setSelectedPrId(Number(e.target.value))}
            value={selectedPrId ?? ""}
          >
            <option value="">Selecione um PR...</option>
            {(allPRs.data?.pullRequests ?? []).map((pr) => (
              <option key={pr.id} value={pr.id}>
                {pr.repoFullName} #{pr.number} — {pr.title}
              </option>
            ))}
          </select>
          <div style={{ display: "flex", gap: "8px" }}>
            <button type="button" style={buttonStyle} onClick={handleLink} disabled={!selectedPrId}>
              Vincular
            </button>
            <button type="button" style={buttonStyle} onClick={() => setShowLinkInput(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/ui/components/ReviewDropdown.tsx src/ui/components/DetailTab.tsx
git commit -m "feat: add GitHub detail tab for cards with PR display and review dropdown"
```

---

## Task 15: UI — Dashboard Widget, Graphs Page, Context Menu

**Files:**
- Create: `src/ui/components/DashboardWidget.tsx`
- Create: `src/ui/components/GraphsPage.tsx`

- [ ] **Step 1: Create dashboard widget**

```tsx
// src/ui/components/DashboardWidget.tsx

import React from "react";
import type { PluginWidgetProps } from "@paperclipai/plugin-sdk/ui";
import { useHostNavigation, usePluginData } from "@paperclipai/plugin-sdk/ui";
import { PATHS, timeAgo } from "./shared.js";

export function GitHubDashboardWidget({ context }: PluginWidgetProps) {
  const nav = useHostNavigation();
  const syncStatus = usePluginData<{ lastSync: string | null; repoCount: number; openPRCount: number }>("sync-status", {
    companyId: context.companyId,
  });

  const data = syncStatus.data;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong style={{ fontSize: "13px" }}>GitHub</strong>
        <span style={{
          display: "inline-block", width: "8px", height: "8px", borderRadius: "50%",
          background: data ? "#22c55e" : "#6b7280",
        }} />
      </div>
      <div style={{ display: "grid", gap: "2px" }}>
        <div>Repositórios: {data?.repoCount ?? 0}</div>
        <div>PRs abertos: {data?.openPRCount ?? 0}</div>
        <div>Último sync: {data?.lastSync ? timeAgo(data.lastSync) : "nunca"}</div>
      </div>
      <a {...nav.linkProps(PATHS.prs)} style={{ fontSize: "12px", color: "#3b82f6" }}>
        Ver Pull Requests →
      </a>
    </div>
  );
}
```

- [ ] **Step 2: Create graphs page**

```tsx
// src/ui/components/GraphsPage.tsx

import React, { useState } from "react";
import { useHostContext, usePluginAction } from "@paperclipai/plugin-sdk/ui";
import { layoutStack, cardStyle, buttonStyle, primaryButtonStyle } from "./shared.js";
import type { GraphData } from "../../graphify/graph-generator.js";

export function GitHubGraphsPage() {
  const context = useHostContext();
  const companyId = context.companyId;
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(false);
  const [repoInput, setRepoInput] = useState("");

  const generateGraph = usePluginAction("generate-graph");

  if (!companyId) return <div style={layoutStack}>Selecione uma empresa.</div>;

  const handleGenerateHighLevel = async () => {
    setLoading(true);
    try {
      const result = await generateGraph({ companyId, level: "high" }) as GraphData;
      setGraphData(result);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const handleGenerateCode = async () => {
    if (!repoInput.trim()) return;
    setLoading(true);
    try {
      const result = await generateGraph({ companyId, repoFullName: repoInput.trim(), level: "code" }) as GraphData;
      setGraphData(result);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  return (
    <div style={layoutStack}>
      <h2 style={{ margin: 0, fontSize: "18px" }}>Knowledge Graphs</h2>

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <button type="button" style={primaryButtonStyle} onClick={handleGenerateHighLevel} disabled={loading}>
          {loading ? "Gerando..." : "Grafo de Alto Nível"}
        </button>
        <div style={{ display: "flex", gap: "4px", flex: 1 }}>
          <input
            placeholder="owner/repo para drill-down..."
            value={repoInput}
            onChange={(e) => setRepoInput(e.target.value)}
            style={{ flex: 1, padding: "6px 10px", borderRadius: "6px", border: "1px solid rgba(128,128,128,0.3)", background: "transparent", fontSize: "13px" }}
          />
          <button type="button" style={buttonStyle} onClick={handleGenerateCode} disabled={loading || !repoInput.trim()}>
            Grafo de Código
          </button>
        </div>
      </div>

      {graphData && (
        <div style={cardStyle}>
          <div style={{ marginBottom: "8px", fontSize: "13px" }}>
            <strong>{graphData.level === "high" ? "Visão Geral" : graphData.repoFullName}</strong>
            <span style={{ marginLeft: "8px", fontSize: "11px", opacity: 0.5 }}>
              {graphData.nodes.length} nós · {graphData.edges.length} arestas · {new Date(graphData.generatedAt).toLocaleString()}
            </span>
          </div>
          {/* Graph visualization — render nodes and edges as a simple list for v1 */}
          <div style={{ maxHeight: "400px", overflow: "auto", fontSize: "12px" }}>
            <div style={{ marginBottom: "8px" }}>
              <strong>Nós:</strong>
              {graphData.nodes.map((node) => (
                <div key={node.id} style={{ padding: "2px 0", paddingLeft: "12px" }}>
                  <span style={{ opacity: 0.5 }}>[{node.type}]</span> {node.label}
                </div>
              ))}
            </div>
            <div>
              <strong>Arestas:</strong>
              {graphData.edges.map((edge, i) => (
                <div key={i} style={{ padding: "2px 0", paddingLeft: "12px" }}>
                  {edge.source} → {edge.target} <span style={{ opacity: 0.5 }}>({edge.label})</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {!graphData && !loading && (
        <div style={{ ...cardStyle, textAlign: "center", opacity: 0.5 }}>
          Clique em um dos botões acima para gerar um knowledge graph.
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/ui/components/DashboardWidget.tsx src/ui/components/GraphsPage.tsx
git commit -m "feat: add dashboard widget and knowledge graphs page"
```

---

## Task 16: UI — Index (Re-exports)

**Files:**
- Create: `src/ui/index.tsx`

- [ ] **Step 1: Create UI entry point with all exports**

```tsx
// src/ui/index.tsx

// Sidebar
export { GitHubSidebarLink, GitHubSidebarPanel, GitHubRouteSidebar } from "./components/Sidebar.js";

// Pages
export { GitHubSettingsPage } from "./components/SettingsPage.js";
export { GitHubReposPage } from "./components/ReposPage.js";
export { GitHubPullRequestsPage } from "./components/PullRequestsPage.js";
export { GitHubGraphsPage } from "./components/GraphsPage.js";

// Detail tab (inside cards)
export { GitHubDetailTab } from "./components/DetailTab.js";

// Dashboard
export { GitHubDashboardWidget } from "./components/DashboardWidget.js";

// Context menu
export { GitHubContextMenu } from "./components/ContextMenu.js";
```

- [ ] **Step 2: Create context menu component**

```tsx
// src/ui/components/ContextMenu.tsx

import React from "react";
import { useHostContext, usePluginAction } from "@paperclipai/plugin-sdk/ui";
import { buttonStyle } from "./shared.js";

export function GitHubContextMenu() {
  const context = useHostContext();
  const generateGraph = usePluginAction("generate-graph");

  const handleGraphify = () => {
    if (!context.companyId) return;
    // This would typically receive the repo context from the entity
    void generateGraph({
      companyId: context.companyId,
      level: "high",
    }).catch(console.error);
  };

  return (
    <button type="button" style={buttonStyle} onClick={handleGraphify}>
      Gerar Knowledge Graph
    </button>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build completes with `dist/worker.js` and `dist/ui/index.js`

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: No type errors

- [ ] **Step 5: Run all tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/ui/
git commit -m "feat: add UI index with all component re-exports and context menu"
```

---

## Task 17: Final Integration & Verification

**Files:**
- All files from previous tasks

- [ ] **Step 1: Verify complete build**

Run: `npm run build`
Expected: Clean build, `dist/worker.js`, `dist/ui/index.js`, and `dist/ui/index.js.map` created

- [ ] **Step 2: Verify types**

Run: `npm run typecheck`
Expected: Zero errors

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 4: Verify manifest exports match UI exports**

Check that every `exportName` in the manifest's `ui_slots` array corresponds to an actual export in `src/ui/index.tsx`:
- `GitHubSidebarLink` ✓
- `GitHubSidebarPanel` ✓
- `GitHubSettingsPage` ✓
- `GitHubRouteSidebar` ✓
- `GitHubReposPage` ✓
- `GitHubPullRequestsPage` ✓
- `GitHubGraphsPage` ✓
- `GitHubDashboardWidget` ✓
- `GitHubDetailTab` ✓
- `GitHubContextMenu` ✓

- [ ] **Step 5: Verify tool registrations match manifest**

Check that every `toolKey` in the manifest's `tools` array is registered in `registerReviewTools()`:
- `github_get_pull_request_diff` ✓
- `github_read_file_content` ✓
- `github_create_review_comment` ✓
- `github_submit_pr_review` ✓
- `github_list_repositories` ✓
- `github_search_issues` ✓

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: verify integration - all exports, tools, and tests passing"
```
