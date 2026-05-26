#!/bin/bash
set -e

# Inject Claude Code credentials from secret env var
if [ -n "$CLAUDE_CREDENTIALS_JSON" ]; then
  mkdir -p /home/paperclip/.claude
  echo "$CLAUDE_CREDENTIALS_JSON" > /home/paperclip/.claude/.credentials.json
  chown -R paperclip:paperclip /home/paperclip/.claude
  echo "Claude Code credentials injected"
fi

# Inject Cursor credentials from secret env vars
if [ -n "$CURSOR_AUTH_JSON" ]; then
  mkdir -p /home/paperclip/.cursor
  echo "$CURSOR_AUTH_JSON" > /home/paperclip/.cursor/auth.json
  chown -R paperclip:paperclip /home/paperclip/.cursor
  echo "Cursor auth.json injected"
fi

if [ -n "$CURSOR_CLI_CONFIG_JSON" ]; then
  mkdir -p /home/paperclip/.cursor
  echo "$CURSOR_CLI_CONFIG_JSON" > /home/paperclip/.cursor/cli-config.json
  chown -R paperclip:paperclip /home/paperclip/.cursor
  echo "Cursor cli-config.json injected"
fi

# Inject GitHub CLI auth from secret env var
if [ -n "$GH_TOKEN" ]; then
  echo "GitHub CLI token configured via GH_TOKEN"
fi

# Ensure data dir structure exists on persistent volume
mkdir -p /app/data/instances/default/secrets \
         /app/data/instances/default/data/storage \
         /app/data/instances/default/data/backups \
         /app/data/instances/default/logs

# Copy config if not present (first boot with empty volume)
if [ ! -f /app/data/instances/default/config.json ]; then
  cp /app/config-seed/config.json /app/data/instances/default/config.json
  echo "Config seeded to persistent volume"
fi
if [ ! -f /app/data/instances/default/secrets/master.key ]; then
  cp /app/config-seed/master.key /app/data/instances/default/secrets/master.key
  echo "Master key seeded to persistent volume"
fi

# Persist ~/.paperclip on volume (plugins are installed to ~/.paperclip/plugins via npm)
mkdir -p /app/data/dot-paperclip
ln -sfn /app/data/dot-paperclip /home/paperclip/.paperclip

# Ensure data dir is writable by paperclip user
chown -R paperclip:paperclip /app/data /home/paperclip/.paperclip

# Start Paperclip
exec gosu paperclip paperclipai run --data-dir /app/data --no-repair
