import React, { useState, useEffect } from "react";
import { useHostContext, usePluginAction } from "@paperclipai/plugin-sdk/ui";
import { layoutStack, cardStyle, buttonStyle, primaryButtonStyle } from "./shared.js";
import { GitHubNavBar } from "./NavBar.js";
import type { GraphData } from "../../graphify/graph-generator.js";

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

export function GitHubGraphsPage() {
  const context = useHostContext();
  const companyId = context.companyId;
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(false);
  const [repoInput, setRepoInput] = useState("");
  const [autoLoaded, setAutoLoaded] = useState(false);

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

  const handleExportObsidian = () => {
    if (!graphData) return;
    const canvas = toObsidianCanvas(graphData);
    const name = graphData.repoFullName === "*"
      ? "github-overview"
      : graphData.repoFullName.replace("/", "-");
    downloadFile(`${name}.canvas`, canvas);
  };

  return (
    <div style={layoutStack}>
      <GitHubNavBar />
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
                  repo: "Repositories", pr: "Pull Requests", module: "Modules",
                  file: "Source Files", config: "Config", test: "Tests", docs: "Docs",
                };
                const typeColors: Record<string, string> = {
                  repo: "#a855f7", pr: "#22c55e", module: "#3b82f6",
                  file: "#6b7280", config: "#f59e0b", test: "#ef4444", docs: "#06b6d4",
                };
                return (
                  <div key={nodeType} style={{ marginBottom: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                      <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: typeColors[nodeType] ?? "#6b7280", display: "inline-block" }} />
                      <strong>{typeLabels[nodeType] ?? nodeType} ({typeNodes.length})</strong>
                    </div>
                    {typeNodes.map((node) => (
                      <div key={node.id} style={{ padding: "1px 0", paddingLeft: "20px", opacity: 0.8 }}>
                        {node.label}
                        {node.metadata.language && <span style={{ marginLeft: "6px", opacity: 0.4, fontSize: "10px" }}>{node.metadata.language as string}</span>}
                        {node.metadata.size && <span style={{ marginLeft: "6px", opacity: 0.4, fontSize: "10px" }}>{Math.round((node.metadata.size as number) / 1024)}KB</span>}
                        {node.metadata.author && <span style={{ marginLeft: "6px", opacity: 0.4, fontSize: "10px" }}>by {node.metadata.author as string}</span>}
                      </div>
                    ))}
                  </div>
                );
              })}

              {/* Modifies edges (PR → files) */}
              {graphData.edges.filter((e) => e.type === "modifies").length > 0 && (
                <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid rgba(128,128,128,0.15)" }}>
                  <strong>PR → Files Modified</strong>
                  {graphData.edges.filter((e) => e.type === "modifies").map((edge, i) => (
                    <div key={i} style={{ padding: "1px 0", paddingLeft: "20px", opacity: 0.7 }}>
                      {edge.source.replace("pr:", "")} → {edge.target.split("/").pop()} <span style={{ opacity: 0.4 }}>{edge.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {!graphData && !loading && (
        <div style={{ ...cardStyle, textAlign: "center", opacity: 0.5 }}>
          Clique em um dos botões acima para gerar um knowledge graph.
        </div>
      )}
    </div>
  );
}
