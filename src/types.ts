export type GitHubRepoSummary = {
  id: number;
  fullName: string;
  private: boolean;
  htmlUrl: string;
  updatedAt: string;
  defaultBranch: string;
};

export type GitHubPullRequestSummary = {
  id: number;
  number: number;
  title: string;
  state: string;
  htmlUrl: string;
  repoFullName: string;
  updatedAt: string;
};

export type GitHubIssueSummary = {
  id: number;
  number: number;
  title: string;
  state: string;
  htmlUrl: string;
  repoFullName: string;
  updatedAt: string;
};

export type GitHubSyncCache = {
  syncedAt: string;
  pullRequests: GitHubPullRequestSummary[];
  issues: GitHubIssueSummary[];
  errors: string[];
};

export type GitHubWebhookConfig = {
  repoFullName: string;
  events: string[];
  hookId?: number;
  configuredAt: string;
  inboundUrl: string;
};

export type ReposData = {
  status: "ok" | "degraded" | "error";
  checkedAt: string;
  message?: string;
  repos: GitHubRepoSummary[];
};

export type SyncOverviewData = {
  status: "ok" | "not_synced" | "degraded";
  checkedAt: string;
  message: string;
  lastSyncedAt: string | null;
  pullRequestCount: number;
  issueCount: number;
  recentPullRequests: GitHubPullRequestSummary[];
  recentIssues: GitHubIssueSummary[];
  lastErrors: string[];
};
