CREATE TABLE IF NOT EXISTS plugin_cus_github_manager_d2300af002.gh_workflow_runs (
  id            BIGINT PRIMARY KEY,
  repo_id       BIGINT NOT NULL REFERENCES plugin_cus_github_manager_d2300af002.gh_repositories(id) ON DELETE CASCADE,
  run_number    INTEGER NOT NULL,
  workflow_name TEXT NOT NULL,
  head_branch   TEXT,
  head_sha      TEXT,
  status        TEXT NOT NULL,
  conclusion    TEXT,
  pr_number     INTEGER,
  logs_summary  TEXT,
  analyzed_at   TEXT,
  html_url      TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL DEFAULT (now()::text),
  updated_at    TEXT NOT NULL DEFAULT (now()::text)
);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_repo
  ON plugin_cus_github_manager_d2300af002.gh_workflow_runs(repo_id);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_pr
  ON plugin_cus_github_manager_d2300af002.gh_workflow_runs(pr_number);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_conclusion
  ON plugin_cus_github_manager_d2300af002.gh_workflow_runs(conclusion);
