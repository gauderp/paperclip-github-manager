import type { PluginContext } from "@paperclipai/plugin-sdk";
import { githubFetch } from "../github/api-client.js";
import { listRepos, listPRs } from "../db/queries.js";
import type { GitHubRepo, PRWithRepo } from "../types.js";

export type GraphNode = {
  id: string;
  label: string;
  type: "repo" | "pr" | "file" | "module" | "agent" | "config" | "test" | "docs";
  metadata: Record<string, unknown>;
};

export type GraphEdge = {
  source: string;
  target: string;
  label: string;
  type: "dependency" | "pr_target" | "contains" | "imports" | "reviews" | "modifies";
};

export type GraphData = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  generatedAt: string;
  repoFullName: string;
  level: "high" | "code";
  stats?: {
    totalFiles: number;
    totalDirs: number;
    languages: Record<string, number>;
    largestFiles: Array<{ path: string; size: number }>;
  };
};

function classifyFile(path: string): GraphNode["type"] {
  if (/\.(test|spec|e2e)\.(ts|js|tsx|jsx|py|go|rs|java)$/.test(path)) return "test";
  if (/\/__tests__\/|\/test\//.test(path)) return "test";
  if (/\.(md|txt|rst|adoc)$/i.test(path)) return "docs";
  if (/\.(json|ya?ml|toml|ini|conf|env|properties)$/.test(path)) return "config";
  if (/^(\.github|\.vscode|\.idea|\.circleci)\//.test(path)) return "config";
  if (/dockerfile|docker-compose|makefile|justfile/i.test(path)) return "config";
  return "file";
}

function inferLanguage(path: string): string | null {
  const ext = path.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    ts: "TypeScript", tsx: "TypeScript", js: "JavaScript", jsx: "JavaScript",
    py: "Python", go: "Go", rs: "Rust", java: "Java", kt: "Kotlin",
    rb: "Ruby", php: "PHP", cs: "C#", cpp: "C++", c: "C", swift: "Swift",
    dart: "Dart", scala: "Scala", sql: "SQL", sh: "Shell", bash: "Shell",
    vue: "Vue", svelte: "Svelte", css: "CSS", scss: "SCSS", html: "HTML",
  };
  return ext ? (map[ext] ?? null) : null;
}

export async function generateHighLevelGraph(
  ctx: PluginContext,
  companyId: string,
): Promise<GraphData> {
  const repos = await listRepos(ctx.db);
  const prs = await listPRs(ctx.db, { state: "open" });

  const nodes: GraphNode[] = repos.map((r) => ({
    id: `repo:${r.fullName}`,
    label: r.fullName,
    type: "repo" as const,
    metadata: {
      language: r.language,
      private: r.private,
      defaultBranch: r.defaultBranch,
      description: r.description,
    },
  }));

  const edges: GraphEdge[] = [];

  // Group PRs by repo for summary
  const prsByRepo: Record<string, PRWithRepo[]> = {};
  for (const pr of prs) {
    if (!prsByRepo[pr.repoFullName]) prsByRepo[pr.repoFullName] = [];
    prsByRepo[pr.repoFullName].push(pr);
  }

  for (const pr of prs) {
    const prNode: GraphNode = {
      id: `pr:${pr.repoFullName}#${pr.number}`,
      label: `#${pr.number}: ${pr.title}`,
      type: "pr",
      metadata: {
        state: pr.state,
        author: pr.author,
        draft: pr.draft,
        branch: `${pr.headBranch} → ${pr.baseBranch}`,
        updatedAt: pr.updatedAt,
      },
    };
    nodes.push(prNode);
    edges.push({
      source: prNode.id,
      target: `repo:${pr.repoFullName}`,
      label: `${pr.headBranch} → ${pr.baseBranch}`,
      type: "pr_target",
    });
  }

  // Cross-repo edges: repos with same language or shared contributors
  const reposByLang: Record<string, string[]> = {};
  for (const r of repos) {
    if (r.language) {
      if (!reposByLang[r.language]) reposByLang[r.language] = [];
      reposByLang[r.language].push(r.fullName);
    }
  }

  const languages: Record<string, number> = {};
  for (const r of repos) {
    if (r.language) languages[r.language] = (languages[r.language] ?? 0) + 1;
  }

  return {
    nodes,
    edges,
    generatedAt: new Date().toISOString(),
    repoFullName: "*",
    level: "high",
    stats: {
      totalFiles: 0,
      totalDirs: 0,
      languages,
      largestFiles: [],
    },
  };
}

export async function generateCodeGraph(
  ctx: PluginContext,
  companyId: string,
  repoFullName: string,
): Promise<GraphData> {
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
  const dirs = new Set<string>();
  const languages: Record<string, number> = {};
  const allFiles: Array<{ path: string; size: number }> = [];

  for (const entry of tree) {
    const path = entry.path as string;
    const type = entry.type as string;
    const size = (entry.size as number) ?? 0;

    if (type === "tree") {
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
      const depth = path.split("/").length;
      const fileType = classifyFile(path);
      const lang = inferLanguage(path);
      if (lang) languages[lang] = (languages[lang] ?? 0) + 1;
      allFiles.push({ path, size });

      // Include: root files, depth <=2 source, configs, and key source files
      const isRelevant =
        depth <= 2 ||
        fileType === "config" ||
        fileType === "test" ||
        fileType === "docs" ||
        /\.(ts|js|tsx|jsx|py|go|rs|java|kt|rb|php)$/.test(path);

      // Limit depth for source files
      if (isRelevant && depth <= 4) {
        nodes.push({
          id: `file:${repoFullName}/${path}`,
          label: path.split("/").pop()!,
          type: fileType,
          metadata: { path, size, language: lang },
        });

        const parentDir = path.split("/").slice(0, -1).join("/");
        const parentId = parentDir && dirs.has(parentDir)
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

  // Fetch open PRs to show which files are being modified
  try {
    const prs = await listPRs(ctx.db, { state: "open" });
    const repoPRs = prs.filter((pr) => pr.repoFullName === repoFullName);

    for (const pr of repoPRs.slice(0, 10)) {
      const prNodeId = `pr:${repoFullName}#${pr.number}`;
      nodes.push({
        id: prNodeId,
        label: `PR #${pr.number}: ${pr.title}`,
        type: "pr",
        metadata: { author: pr.author, branch: pr.headBranch, draft: pr.draft },
      });

      // Get files changed in PR
      try {
        const { data: prFiles } = await githubFetch(
          ctx, companyId,
          `/repos/${repoFullName}/pulls/${pr.number}/files?per_page=30`,
        );
        for (const f of (prFiles as Array<Record<string, unknown>>)) {
          const filePath = f.filename as string;
          const fileNodeId = `file:${repoFullName}/${filePath}`;
          // Only link if the file node exists in our graph
          if (nodes.some((n) => n.id === fileNodeId)) {
            edges.push({
              source: prNodeId,
              target: fileNodeId,
              label: `${f.status} (+${f.additions}/-${f.deletions})`,
              type: "modifies",
            });
          }
        }
      } catch {
        // PR files fetch failed, skip
      }
    }
  } catch {
    // PRs fetch failed, skip
  }

  // Sort largest files
  allFiles.sort((a, b) => b.size - a.size);

  return {
    nodes,
    edges,
    generatedAt: new Date().toISOString(),
    repoFullName,
    level: "code",
    stats: {
      totalFiles: allFiles.length,
      totalDirs: dirs.size,
      languages,
      largestFiles: allFiles.slice(0, 10),
    },
  };
}
