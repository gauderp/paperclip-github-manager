#!/bin/bash
set -e

# Inject Claude Code credentials from secret env var
if [ -n "$CLAUDE_CREDENTIALS_JSON" ]; then
  mkdir -p /root/.claude
  echo "$CLAUDE_CREDENTIALS_JSON" > /root/.claude/.credentials.json
  echo "Claude Code credentials injected"
fi

# Inject Cursor credentials from secret env vars
if [ -n "$CURSOR_AUTH_JSON" ]; then
  mkdir -p /root/.cursor
  echo "$CURSOR_AUTH_JSON" > /root/.cursor/auth.json
  echo "Cursor auth.json injected"
fi

if [ -n "$CURSOR_CLI_CONFIG_JSON" ]; then
  mkdir -p /root/.cursor
  echo "$CURSOR_CLI_CONFIG_JSON" > /root/.cursor/cli-config.json
  echo "Cursor cli-config.json injected"
fi

# Inject GitHub CLI auth from secret env var
if [ -n "$GH_TOKEN" ]; then
  echo "GitHub CLI token configured via GH_TOKEN"
fi

# Start Paperclip
exec paperclipai run --data-dir /app/data --no-repair
