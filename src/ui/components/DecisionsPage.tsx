import React, { useState } from "react";
import { useHostContext, usePluginData, usePluginAction } from "@paperclipai/plugin-sdk/ui";
import { layoutStack, cardStyle, buttonStyle, primaryButtonStyle, badgeStyle } from "./shared.js";
import { GitHubNavBar } from "./NavBar.js";
import type { DecisionLogEntry, DecisionStatus, DecisionSourceType } from "../../types.js";

const STATUS_COLORS: Record<string, string> = {
  proposed: "#f59e0b",
  accepted: "#22c55e",
  deprecated: "#6b7280",
  superseded: "#ef4444",
};

const SOURCE_TYPE_LABELS: Record<DecisionSourceType, string> = {
  pull_request: "PR",
  issue: "IS",
  discussion: "DC",
};

type DecisionListData = {
  decisions: DecisionLogEntry[];
};

export function GitHubDecisionsPage() {
  const context = useHostContext();
  const companyId = context.companyId;

  const [repoInput, setRepoInput] = useState("");
  const [repoFullName, setRepoFullName] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<DecisionStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const extractDecisions = usePluginAction("extract-decisions");
  const generateOnboarding = usePluginAction("generate-onboarding-docs");

  const { data, loading } = usePluginData<DecisionListData>(
    "decision-log",
    repoFullName
      ? {
          companyId,
          repoFullName,
          status: statusFilter === "all" ? undefined : statusFilter,
          search: search.trim() || undefined,
        }
      : null,
  );

  const decisions = data?.decisions ?? [];

  if (!companyId) return <div style={layoutStack}>Selecione uma empresa.</div>;

  const handleView = () => {
    const trimmed = repoInput.trim();
    if (trimmed) setRepoFullName(trimmed);
  };

  const handleExtract = async () => {
    if (!repoFullName) return;
    setActionLoading("extract");
    try {
      await extractDecisions({ companyId, repoFullName });
    } catch (err) {
      console.error(err);
    }
    setActionLoading(null);
  };

  const handleGenerateOnboarding = async () => {
    if (!repoFullName) return;
    setActionLoading("onboarding");
    try {
      await generateOnboarding({ companyId, repoFullName });
    } catch (err) {
      console.error(err);
    }
    setActionLoading(null);
  };

  return (
    <div style={layoutStack}>
      <GitHubNavBar />
      <h2 style={{ margin: 0, fontSize: "18px" }}>Architectural Decisions</h2>

      {/* Repo input */}
      <div style={{ display: "flex", gap: "4px" }}>
        <input
          placeholder="owner/repo"
          value={repoInput}
          onChange={(e) => setRepoInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleView()}
          style={{
            flex: 1,
            padding: "6px 10px",
            borderRadius: "6px",
            border: "1px solid rgba(128,128,128,0.3)",
            background: "transparent",
            fontSize: "13px",
          }}
        />
        <button type="button" style={primaryButtonStyle} onClick={handleView} disabled={!repoInput.trim()}>
          View
        </button>
      </div>

      {repoFullName && (
        <>
          {/* Filters + actions bar */}
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as DecisionStatus | "all")}
              style={{
                padding: "6px 10px",
                borderRadius: "6px",
                border: "1px solid rgba(128,128,128,0.3)",
                background: "transparent",
                fontSize: "13px",
              }}
            >
              <option value="all">All statuses</option>
              <option value="proposed">Proposed</option>
              <option value="accepted">Accepted</option>
              <option value="deprecated">Deprecated</option>
              <option value="superseded">Superseded</option>
            </select>

            <input
              placeholder="Search decisions..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                flex: 1,
                minWidth: "150px",
                padding: "6px 10px",
                borderRadius: "6px",
                border: "1px solid rgba(128,128,128,0.3)",
                background: "transparent",
                fontSize: "13px",
              }}
            />

            <button type="button" style={primaryButtonStyle} onClick={handleExtract} disabled={actionLoading !== null}>
              {actionLoading === "extract" ? "Extracting..." : "Extract Decisions"}
            </button>
            <button type="button" style={buttonStyle} onClick={handleGenerateOnboarding} disabled={actionLoading !== null}>
              {actionLoading === "onboarding" ? "Generating..." : "Generate Onboarding Docs"}
            </button>
          </div>

          {/* Loading state */}
          {loading && (
            <div style={{ ...cardStyle, textAlign: "center", opacity: 0.5 }}>Loading decisions...</div>
          )}

          {/* Empty state */}
          {!loading && decisions.length === 0 && (
            <div style={{ ...cardStyle, textAlign: "center", opacity: 0.5 }}>
              No decisions found. Click &quot;Extract Decisions&quot; to analyze this repository.
            </div>
          )}

          {/* Decision cards */}
          {decisions.map((d) => {
            const isExpanded = expandedId === d.id;
            const statusColor = STATUS_COLORS[d.status] ?? "#6b7280";
            const sourceLabel = SOURCE_TYPE_LABELS[d.sourceType] ?? d.sourceType;

            return (
              <div
                key={d.id}
                style={{ ...cardStyle, cursor: "pointer" }}
                onClick={() => setExpandedId(isExpanded ? null : d.id)}
              >
                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <span style={badgeStyle("#3b82f6")}>ADR-{String(d.adrNumber).padStart(3, "0")}</span>
                  <strong style={{ fontSize: "13px", flex: 1 }}>{d.title}</strong>
                  <span style={badgeStyle(statusColor)}>{d.status}</span>
                </div>

                {/* Meta row */}
                <div style={{ display: "flex", gap: "12px", marginTop: "6px", fontSize: "11px", opacity: 0.6 }}>
                  <span>Source: {sourceLabel} #{d.sourceNumber}</span>
                  {d.decidedAt && <span>Decided: {new Date(d.decidedAt).toLocaleDateString()}</span>}
                  {d.sourceUrl && (
                    <a
                      href={d.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      style={{ color: "#3b82f6", textDecoration: "none" }}
                    >
                      View source
                    </a>
                  )}
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div style={{ marginTop: "12px", paddingTop: "10px", borderTop: "1px solid rgba(128,128,128,0.15)", fontSize: "12px" }}>
                    {d.contextText && (
                      <div style={{ marginBottom: "10px" }}>
                        <strong style={{ fontSize: "11px", textTransform: "uppercase", opacity: 0.5, display: "block", marginBottom: "4px" }}>
                          Context
                        </strong>
                        <div style={{ whiteSpace: "pre-wrap", opacity: 0.85 }}>{d.contextText}</div>
                      </div>
                    )}
                    {d.decisionText && (
                      <div style={{ marginBottom: "10px" }}>
                        <strong style={{ fontSize: "11px", textTransform: "uppercase", opacity: 0.5, display: "block", marginBottom: "4px" }}>
                          Decision
                        </strong>
                        <div style={{ whiteSpace: "pre-wrap", opacity: 0.85 }}>{d.decisionText}</div>
                      </div>
                    )}
                    {d.consequencesText && (
                      <div>
                        <strong style={{ fontSize: "11px", textTransform: "uppercase", opacity: 0.5, display: "block", marginBottom: "4px" }}>
                          Consequences
                        </strong>
                        <div style={{ whiteSpace: "pre-wrap", opacity: 0.85 }}>{d.consequencesText}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}

      {!repoFullName && (
        <div style={{ ...cardStyle, textAlign: "center", opacity: 0.5 }}>
          Enter a repository (owner/repo) and click &quot;View&quot; to see architectural decisions.
        </div>
      )}
    </div>
  );
}
