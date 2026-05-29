import React, { useState, useEffect } from "react";
import { useHostContext, usePluginAction, usePluginData } from "@paperclipai/plugin-sdk/ui";
import { layoutStack, cardStyle, buttonStyle, primaryButtonStyle, badgeStyle } from "./shared.js";
import { GitHubNavBar } from "./NavBar.js";
import type { GraphData } from "../../graphify/graph-generator.js";
import type { KnowledgeNode, KnowledgeEdge } from "../../types.js";

/* ── helpers (unchanged) ─────────────────────────────────────────────── */

function toObsidianCanvas(graph: GraphData): string {
  const CARD_W = 250;
  const CARD_H = 60;
  const COL_GAP = 300;
  const ROW_GAP = 100;

  const typeOrder: Record<string, number> = { repo: 0, module: 1, file: 2, pr: 3, agent: 4 };
  const grouped: Record<string, typeof graph.nodes> = {};
  for (const n of graph.nodes) {
    const t = n.type;
    if (!grouped[t]) grouped[t] = [];
    grouped[t].push(n);
  }

  const canvasNodes: Array<Record<string, unknown>> = [];
  const posMap: Record<string, { x: number; y: number }> = {};
  let col = 0;

  for (const type of Object.keys(grouped).sort((a, b) => (typeOrder[a] ?? 9) - (typeOrder[b] ?? 9))) {
    const items = grouped[type];
    let row = 0;
    for (const node of items) {
      const x = col * COL_GAP;
      const y = row * ROW_GAP;
      posMap[node.id] = { x, y };
      const color = type === "repo" ? "1" : type === "pr" ? "4" : type === "module" ? "3" : "0";
      canvasNodes.push({
        id: node.id,
        type: "text",
        x,
        y,
        width: CARD_W,
        height: CARD_H,
        color,
        text: `**[${node.type}]** ${node.label}`,
      });
      row++;
    }
    col++;
  }

  const canvasEdges = graph.edges.map((e, i) => ({
    id: `edge-${i}`,
    fromNode: e.source,
    toNode: e.target,
    fromSide: "right",
    toSide: "left",
    label: e.label,
  }));

  return JSON.stringify({ nodes: canvasNodes, edges: canvasEdges }, null, 2);
}

function downloadFile(filename: string, content: string, mime = "application/json") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ── Knowledge Graph tab ─────────────────────────────────────────────── */

const NODE_TYPE_COLORS: Record<string, string> = {
  module: "#3b82f6",
  component: "#a855f7",
  service: "#22c55e",
  api_endpoint: "#f59e0b",
  pattern: "#ef4444",
  dependency: "#6b7280",
};

type KnowledgeGraphData = {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
};

function KnowledgeGraphTabByName({ companyId, repoFullName }: { companyId: string; repoFullName: string }) {
  const { data, loading } = usePluginData<KnowledgeGraphData>("knowledge-graph-data", {
    companyId,
    repoFullName,
  });

  if (loading) {
    return <div style={{ ...cardStyle, textAlign: "center", opacity: 0.5 }}>Loading knowledge graph...</div>;
  }

  if (!data || (!data.nodes.length && !data.edges.length)) {
    return <div style={{ ...cardStyle, textAlign: "center", opacity: 0.5 }}>No knowledge graph data found for this repository. Run knowledge extraction first.</div>;
  }

  const nodes = data.nodes;
  const edges = data.edges;
  const typeSet = new Set(nodes.map((n) => n.nodeType));

  // Group nodes by type
  const grouped: Record<string, KnowledgeNode[]> = {};
  for (const n of nodes) {
    if (!grouped[n.nodeType]) grouped[n.nodeType] = [];
    grouped[n.nodeType].push(n);
  }

  // Sort edges by weight descending
  const topEdges = [...edges].sort((a, b) => b.weight - a.weight).slice(0, 20);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {/* Summary stats */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <div style={{ ...cardStyle, flex: 1, minWidth: "120px", textAlign: "center" }}>
          <div style={{ fontSize: "24px", fontWeight: 700 }}>{nodes.length}</div>
          <div style={{ fontSize: "11px", opacity: 0.5 }}>nodes</div>
        </div>
        <div style={{ ...cardStyle, flex: 1, minWidth: "120px", textAlign: "center" }}>
          <div style={{ fontSize: "24px", fontWeight: 700 }}>{edges.length}</div>
          <div style={{ fontSize: "11px", opacity: 0.5 }}>edges</div>
        </div>
        <div style={{ ...cardStyle, flex: 1, minWidth: "120px", textAlign: "center" }}>
          <div style={{ fontSize: "24px", fontWeight: 700 }}>{typeSet.size}</div>
          <div style={{ fontSize: "11px", opacity: 0.5 }}>types</div>
        </div>
      </div>

      {/* Nodes by Type */}
      <div style={cardStyle}>
        <strong style={{ fontSize: "13px" }}>Nodes by Type</strong>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "8px" }}>
          {Object.entries(grouped).map(([type, typeNodes]) => (
            <div key={type}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                <span
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background: NODE_TYPE_COLORS[type] ?? "#6b7280",
                    display: "inline-block",
                  }}
                />
                <strong style={{ fontSize: "12px" }}>
                  {type} ({typeNodes.length})
                </strong>
              </div>
              <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", paddingLeft: "14px" }}>
                {typeNodes.map((node) => (
                  <span
                    key={node.id}
                    style={{
                      padding: "2px 10px",
                      borderRadius: "12px",
                      fontSize: "11px",
                      background: `${NODE_TYPE_COLORS[type] ?? "#6b7280"}20`,
                      color: NODE_TYPE_COLORS[type] ?? "#6b7280",
                    }}
                  >
                    {node.name}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Strongest Connections */}
      {topEdges.length > 0 && (
        <div style={cardStyle}>
          <strong style={{ fontSize: "13px" }}>Strongest Connections</strong>
          <div style={{ marginTop: "8px", fontSize: "12px" }}>
            {topEdges.map((edge, i) => {
              const sourceNode = nodes.find((n) => n.id === edge.sourceNodeId);
              const targetNode = nodes.find((n) => n.id === edge.targetNodeId);
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "3px 0",
                    borderBottom: i < topEdges.length - 1 ? "1px solid rgba(128,128,128,0.1)" : "none",
                  }}
                >
                  <span style={{ opacity: 0.8 }}>{sourceNode?.name ?? edge.sourceNodeId}</span>
                  <span style={{ opacity: 0.4, fontSize: "10px" }}>—{edge.edgeType}→</span>
                  <span style={{ opacity: 0.8 }}>{targetNode?.name ?? edge.targetNodeId}</span>
                  <span
                    style={{
                      marginLeft: "auto",
                      ...badgeStyle("#3b82f6"),
                    }}
                  >
                    w{edge.weight}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Main page with tabs ─────────────────────────────────────────────── */

type TabId = "high-level" | "code-level" | "knowledge";

const tabs: Array<{ id: TabId; label: string }> = [
  { id: "high-level", label: "High-Level Graph" },
  { id: "code-level", label: "Code Graph" },
  { id: "knowledge", label: "Knowledge Graph" },
];

export function GitHubGraphsPage() {
  const context = useHostContext();
  const companyId = context.companyId;
  const [activeTab, setActiveTab] = useState<TabId>("high-level");
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(false);
  const [repoInput, setRepoInput] = useState("");
  const [autoLoaded, setAutoLoaded] = useState(false);

  // Knowledge Graph tab state
  const [kgRepoInput, setKgRepoInput] = useState("");
  const [kgRepoFullName, setKgRepoFullName] = useState<string | null>(null);

  const generateGraph = usePluginAction("generate-graph");

  // Auto-load graph from query param (when coming from Repos page Graphify button)
  useEffect(() => {
    if (autoLoaded || !companyId) return;
    const params = new URLSearchParams(window.location.search);
    const repo = params.get("repo");
    if (repo) {
      setRepoInput(repo);
      setAutoLoaded(true);
      setLoading(true);
      setActiveTab("code-level");
      generateGraph({ companyId, repoFullName: repo, level: "code" })
        .then((result) => setGraphData(result as GraphData))
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [companyId, autoLoaded]);

  if (!companyId) return <div style={layoutStack}>Selecione uma empresa.</div>;

  const handleGenerateHighLevel = async () => {
    setLoading(true);
    try {
      const result = (await generateGraph({ companyId, level: "high" })) as GraphData;
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
      const result = (await generateGraph({ companyId, repoFullName: repoInput.trim(), level: "code" })) as GraphData;
      setGraphData(result);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const handleExportObsidian = () => {
    if (!graphData) return;
    const canvas = toObsidianCanvas(graphData);
    const name = graphData.repoFullName === "*" ? "github-overview" : graphData.repoFullName.replace("/", "-");
    downloadFile(`${name}.canvas`, canvas);
  };

  const handleViewKnowledgeGraph = () => {
    const trimmed = kgRepoInput.trim();
    if (trimmed) setKgRepoFullName(trimmed);
  };

  /* ── shared graph result renderer (high-level + code-level) ───── */
  const renderGraphResult = () => {
    if (!graphData && !loading) {
      return (
        <div style={{ ...cardStyle, textAlign: "center", opacity: 0.5 }}>
          Clique em um dos botões acima para gerar um knowledge graph.
        </div>
      );
    }

    if (!graphData) return null;

    return (
      <>
        {graphData.stats && (
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <div style={{ ...cardStyle, flex: 1, minWidth: "120px", textAlign: "center" }}>
              <div style={{ fontSize: "24px", fontWeight: 700 }}>{graphData.nodes.length}</div>
              <div style={{ fontSize: "11px", opacity: 0.5 }}>nodes</div>
            </div>
            <div style={{ ...cardStyle, flex: 1, minWidth: "120px", textAlign: "center" }}>
              <div style={{ fontSize: "24px", fontWeight: 700 }}>{graphData.edges.length}</div>
              <div style={{ fontSize: "11px", opacity: 0.5 }}>edges</div>
            </div>
            <div style={{ ...cardStyle, flex: 1, minWidth: "120px", textAlign: "center" }}>
              <div style={{ fontSize: "24px", fontWeight: 700 }}>{graphData.stats.totalFiles}</div>
              <div style={{ fontSize: "11px", opacity: 0.5 }}>files</div>
            </div>
            <div style={{ ...cardStyle, flex: 1, minWidth: "120px", textAlign: "center" }}>
              <div style={{ fontSize: "24px", fontWeight: 700 }}>{Object.keys(graphData.stats.languages).length}</div>
              <div style={{ fontSize: "11px", opacity: 0.5 }}>languages</div>
            </div>
          </div>
        )}

        {graphData.stats && Object.keys(graphData.stats.languages).length > 0 && (
          <div style={cardStyle}>
            <strong style={{ fontSize: "13px" }}>Languages</strong>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "6px" }}>
              {Object.entries(graphData.stats.languages)
                .sort(([, a], [, b]) => b - a)
                .map(([lang, count]) => (
                  <span key={lang} style={{ padding: "2px 10px", borderRadius: "12px", fontSize: "11px", background: "rgba(59,130,246,0.1)", color: "#3b82f6" }}>
                    {lang}: {count}
                  </span>
                ))}
            </div>
          </div>
        )}

        <div style={cardStyle}>
          <div style={{ marginBottom: "8px", fontSize: "13px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <strong>{graphData.level === "high" ? "Visão Geral" : graphData.repoFullName}</strong>
              <span style={{ marginLeft: "8px", fontSize: "11px", opacity: 0.5 }}>
                {new Date(graphData.generatedAt).toLocaleString()}
              </span>
            </div>
            <button type="button" style={primaryButtonStyle} onClick={handleExportObsidian}>
              Exportar Obsidian
            </button>
          </div>

          <div style={{ maxHeight: "500px", overflow: "auto", fontSize: "12px" }}>
            {/* Group nodes by type */}
            {["repo", "pr", "module", "file", "config", "test", "docs"].map((nodeType) => {
              const typeNodes = graphData.nodes.filter((n) => n.type === nodeType);
              if (typeNodes.length === 0) return null;
              const typeLabels: Record<string, string> = {
                repo: "Repositories",
                pr: "Pull Requests",
                module: "Modules",
                file: "Source Files",
                config: "Config",
                test: "Tests",
                docs: "Docs",
              };
              const typeColors: Record<string, string> = {
                repo: "#a855f7",
                pr: "#22c55e",
                module: "#3b82f6",
                file: "#6b7280",
                config: "#f59e0b",
                test: "#ef4444",
                docs: "#06b6d4",
              };
              return (
                <div key={nodeType} style={{ marginBottom: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: typeColors[nodeType] ?? "#6b7280", display: "inline-block" }} />
                    <strong>
                      {typeLabels[nodeType] ?? nodeType} ({typeNodes.length})
                    </strong>
                  </div>
                  {typeNodes.map((node) => (
                    <div key={node.id} style={{ padding: "1px 0", paddingLeft: "20px", opacity: 0.8 }}>
                      {node.label}
                      {node.metadata.language && (
                        <span style={{ marginLeft: "6px", opacity: 0.4, fontSize: "10px" }}>{node.metadata.language as string}</span>
                      )}
                      {node.metadata.size && (
                        <span style={{ marginLeft: "6px", opacity: 0.4, fontSize: "10px" }}>{Math.round((node.metadata.size as number) / 1024)}KB</span>
                      )}
                      {node.metadata.author && (
                        <span style={{ marginLeft: "6px", opacity: 0.4, fontSize: "10px" }}>by {node.metadata.author as string}</span>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}

            {/* Modifies edges (PR -> files) */}
            {graphData.edges.filter((e) => e.type === "modifies").length > 0 && (
              <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid rgba(128,128,128,0.15)" }}>
                <strong>PR &rarr; Files Modified</strong>
                {graphData.edges
                  .filter((e) => e.type === "modifies")
                  .map((edge, i) => (
                    <div key={i} style={{ padding: "1px 0", paddingLeft: "20px", opacity: 0.7 }}>
                      {edge.source.replace("pr:", "")} &rarr; {edge.target.split("/").pop()}{" "}
                      <span style={{ opacity: 0.4 }}>{edge.label}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      </>
    );
  };

  return (
    <div style={layoutStack}>
      <GitHubNavBar />
      <h2 style={{ margin: 0, fontSize: "18px" }}>Knowledge Graphs</h2>

      {/* Tab switcher */}
      <div style={{ display: "flex", gap: "4px", borderBottom: "1px solid rgba(128,128,128,0.2)", paddingBottom: "0" }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: "6px 14px",
              border: "none",
              borderBottom: activeTab === tab.id ? "2px solid #3b82f6" : "2px solid transparent",
              background: "transparent",
              cursor: "pointer",
              fontSize: "13px",
              color: activeTab === tab.id ? "#3b82f6" : "inherit",
              fontWeight: activeTab === tab.id ? 600 : 400,
              borderRadius: "6px 6px 0 0",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── High-Level Graph tab ─────────────────────────────────── */}
      {activeTab === "high-level" && (
        <>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button type="button" style={primaryButtonStyle} onClick={handleGenerateHighLevel} disabled={loading}>
              {loading ? "Gerando..." : "Grafo de Alto Nível"}
            </button>
          </div>
          {renderGraphResult()}
        </>
      )}

      {/* ── Code Graph tab ───────────────────────────────────────── */}
      {activeTab === "code-level" && (
        <>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: "4px", flex: 1 }}>
              <input
                placeholder="owner/repo para drill-down..."
                value={repoInput}
                onChange={(e) => setRepoInput(e.target.value)}
                style={{
                  flex: 1,
                  padding: "6px 10px",
                  borderRadius: "6px",
                  border: "1px solid rgba(128,128,128,0.3)",
                  background: "transparent",
                  fontSize: "13px",
                }}
              />
              <button type="button" style={buttonStyle} onClick={handleGenerateCode} disabled={loading || !repoInput.trim()}>
                Grafo de Código
              </button>
            </div>
          </div>
          {renderGraphResult()}
        </>
      )}

      {/* ── Knowledge Graph tab ──────────────────────────────────── */}
      {activeTab === "knowledge" && (
        <>
          <div style={{ display: "flex", gap: "4px" }}>
            <input
              placeholder="owner/repo"
              value={kgRepoInput}
              onChange={(e) => setKgRepoInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleViewKnowledgeGraph()}
              style={{
                flex: 1,
                padding: "6px 10px",
                borderRadius: "6px",
                border: "1px solid rgba(128,128,128,0.3)",
                background: "transparent",
                fontSize: "13px",
              }}
            />
            <button type="button" style={primaryButtonStyle} onClick={handleViewKnowledgeGraph} disabled={!kgRepoInput.trim()}>
              Ver Graph
            </button>
          </div>

          {kgRepoFullName ? (
            <KnowledgeGraphTabByName companyId={companyId} repoFullName={kgRepoFullName} />
          ) : (
            <div style={{ ...cardStyle, textAlign: "center", opacity: 0.5 }}>
              Enter a repository (owner/repo) and click &quot;Ver Graph&quot; to view its knowledge graph.
            </div>
          )}
        </>
      )}
    </div>
  );
}
