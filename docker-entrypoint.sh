#!/bin/sh
set -e

# Detect the UID/GID of the mounted /app/config directory
CONFIG_UID=$(stat -c %u /app/config 2>/dev/null || stat -f %u /app/config 2>/dev/null || echo 0)
CONFIG_GID=$(stat -c %g /app/config 2>/dev/null || stat -f %g /app/config 2>/dev/null || echo 0)

echo "Detected /app/config ownership: UID=$CONFIG_UID, GID=$CONFIG_GID"

# If running as root and the mounted volume has a specific owner, create a matching user
if [ "$(id -u)" = "0" ]; then
  if [ "$CONFIG_UID" != "0" ] && [ "$CONFIG_UID" != "1001" ]; then
    echo "Creating app user with UID=$CONFIG_UID, GID=$CONFIG_GID to match mounted volume"
    # Remove any existing groups/users with these IDs
    delgroup $(getent group $CONFIG_GID | cut -d: -f1) 2>/dev/null || true
    deluser nextjs 2>/dev/null || true
    
    addgroup -g $CONFIG_GID nextjs
    adduser -D -u $CONFIG_UID -G nextjs nextjs
  else
    echo "Creating app user with default UID=1001, GID=1001"
    delgroup nextjs 2>/dev/null || true
    deluser nextjs 2>/dev/null || true
    addgroup -g 1001 nextjs
    adduser -D -u 1001 -G nextjs nextjs
  fi
  
  RUN_UID=$CONFIG_UID
  RUN_GID=$CONFIG_GID
  [ "$RUN_UID" = "0" ] && RUN_UID=1001
  [ "$RUN_GID" = "0" ] && RUN_GID=1001
  
  echo "Running migrations and app as UID=$RUN_UID, GID=$RUN_GID"
  
  echo "Running Prisma migrations..."
  su-exec $RUN_UID:$RUN_GID npx prisma db push
  
  echo "Starting Inkarr..."
  exec su-exec $RUN_UID:$RUN_GID node server.js
else
  echo "Running as current user (already unprivileged)"
  echo "Running Prisma migrations..."
  npx prisma db push
  
  echo "Starting Inkarr..."
  exec node server.js
fi
