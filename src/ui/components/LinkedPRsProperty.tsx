import React from "react";
import { usePluginData } from "@paperclipai/plugin-sdk/ui";
import { badgeStyle, prStateBadge } from "./shared.js";
import type { PRWithRepo } from "../../types.js";

interface PropertyContext {
  context: {
    entityId: string;
    entityType: string;
    companyId: string;
  };
}

export function GitHubLinkedPRsProperty({ context }: PropertyContext) {
  const { data, isLoading } = usePluginData<{ pullRequests: PRWithRepo[] }>("card-prs", {
    companyId: context.companyId,
    issueId: context.entityId,
  });

  const prs = data?.pullRequests ?? [];

  if (isLoading) {
    return <div style={{ fontSize: "13px", opacity: 0.4, padding: "2px 0" }}>Loading...</div>;
  }

  if (prs.length === 0) {
    return <div style={{ fontSize: "13px", opacity: 0.4, padding: "2px 0" }}>None</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px", padding: "2px 0" }}>
      {prs.map((pr) => {
        const badge = prStateBadge(pr.draft ? "draft" : pr.state);
        return (
          <div key={pr.id} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ ...badgeStyle(badge.color), padding: "1px 6px", fontSize: "10px" }}>
              {badge.label}
            </span>
            <a
              href={pr.htmlUrl}
              target="_blank"
              rel="noopener"
              style={{ fontSize: "12px", color: "#3b82f6", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              title={`${pr.repoFullName}#${pr.number}: ${pr.title}`}
            >
              #{pr.number} {pr.title}
            </a>
          </div>
        );
      })}
    </div>
  );
}
