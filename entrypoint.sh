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

# Ensure data dir is writable by paperclip user
chown -R paperclip:paperclip /app/data

# Start Paperclip in background, install plugins, then wait
gosu paperclip paperclipai run --data-dir /app/data --no-repair &
PAPERCLIP_PID=$!

# Wait for Paperclip API to be ready
echo "Waiting for Paperclip API..."
for i in $(seq 1 60); do
  if curl -sf http://127.0.0.1:3100/api/health > /dev/null 2>&1; then
    echo "Paperclip API ready"
    break
  fi
  sleep 1
done

# Install staged plugins using API key
API_KEY="${PAPERCLIP_BOARD_API_KEY:-pcp_board_90394c8d61bdd3653c607ed2eca190cc64ef9ea016e271c0}"
for tgz in /app/plugins/*.tgz; do
  [ -f "$tgz" ] || continue
  plugin_name=$(basename "$tgz" .tgz)
  echo "Installing plugin: $plugin_name"

  # Extract tgz to temp dir
  PLUGIN_DIR="/tmp/plugin-install-${plugin_name}"
  rm -rf "$PLUGIN_DIR"
  mkdir -p "$PLUGIN_DIR"
  tar xzf "$tgz" -C "$PLUGIN_DIR"

  # Find the package directory (npm pack creates a 'package/' subfolder)
  PKG_DIR="$PLUGIN_DIR/package"
  [ -d "$PKG_DIR" ] || PKG_DIR="$PLUGIN_DIR"

  # Try install first
  RESULT=$(curl -s -w "\n%{http_code}" -X POST http://127.0.0.1:3100/api/plugins/install \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $API_KEY" \
    -d "{\"packageName\":\"$PKG_DIR\",\"isLocalPath\":true}")
  HTTP_CODE=$(echo "$RESULT" | tail -1)
  BODY=$(echo "$RESULT" | sed '$d')

  if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
    echo "Plugin $plugin_name installed successfully"
  elif echo "$BODY" | grep -q "already installed"; then
    echo "Plugin $plugin_name already installed, attempting reinstall..."
    # Uninstall via API
    PLUGINS_LIST=$(curl -s -H "Authorization: Bearer $API_KEY" http://127.0.0.1:3100/api/plugins)
    PLUGIN_ID=$(echo "$PLUGINS_LIST" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    if [ -n "$PLUGIN_ID" ]; then
      curl -s -X DELETE "http://127.0.0.1:3100/api/plugins/$PLUGIN_ID" \
        -H "Authorization: Bearer $API_KEY" > /dev/null
      sleep 2
      RESULT2=$(curl -s -w "\n%{http_code}" -X POST http://127.0.0.1:3100/api/plugins/install \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $API_KEY" \
        -d "{\"packageName\":\"$PKG_DIR\",\"isLocalPath\":true}")
      HTTP_CODE2=$(echo "$RESULT2" | tail -1)
      echo "Reinstall returned $HTTP_CODE2"
    fi
  else
    echo "Plugin $plugin_name install returned $HTTP_CODE: $BODY"
  fi

  rm -rf "$PLUGIN_DIR"
done

# Wait for the Paperclip process
wait $PAPERCLIP_PID
