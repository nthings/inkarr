#!/bin/sh
# s6-overlay initialization script for user/group setup
# This script handles PUID and PGID environment variables

# Default values
PUID=${PUID:-1000}
PGID=${PGID:-1000}

echo "[init] Setting user/group - PUID=$PUID, PGID=$PGID"

# Function to remove users/groups that conflict with our target UID/GID
cleanup_conflicts() {
  # Find and remove any user with our target UID
  EXISTING_USER=$(awk -F: -v uid="$PUID" '$3 == uid {print $1}' /etc/passwd | head -1)
  if [ -n "$EXISTING_USER" ] && [ "$EXISTING_USER" != "abc" ]; then
    echo "[init] Removing existing user $EXISTING_USER with UID $PUID"
    deluser "$EXISTING_USER" 2>/dev/null || true
  fi
  
  # Find and remove any group with our target GID
  EXISTING_GROUP=$(awk -F: -v gid="$PGID" '$3 == gid {print $1}' /etc/group | head -1)
  if [ -n "$EXISTING_GROUP" ] && [ "$EXISTING_GROUP" != "abc" ]; then
    echo "[init] Removing existing group $EXISTING_GROUP with GID $PGID"
    # First check if any user has this as primary group and remove them
    for user in $(awk -F: -v gid="$PGID" '$4 == gid {print $1}' /etc/passwd); do
      if [ "$user" != "abc" ]; then
        echo "[init] Removing user $user that uses group $EXISTING_GROUP"
        deluser "$user" 2>/dev/null || true
      fi
    done
    delgroup "$EXISTING_GROUP" 2>/dev/null || true
  fi
}

# Clean up any existing abc user/group first
deluser abc 2>/dev/null || true
delgroup abc 2>/dev/null || true

# Clean up conflicts
cleanup_conflicts

# Create abc group and user
echo "[init] Creating group abc with GID=$PGID"
addgroup -g $PGID abc || { echo "[init] FATAL: Failed to create group abc"; exit 1; }

echo "[init] Creating user abc with UID=$PUID"
adduser -D -u $PUID -G abc abc || { echo "[init] FATAL: Failed to create user abc"; exit 1; }

# Verify user was created
if ! id abc >/dev/null 2>&1; then
  echo "[init] FATAL: User abc was not created properly"
  exit 1
fi

echo "[init] User abc created successfully: $(id abc)"

# Ensure /config directory is owned by abc
if [ -d /config ]; then
  echo "[init] Setting ownership of /config to abc:abc"
  chown -R abc:abc /config
  chmod 755 /config
fi

# Only set ownership on writable directories, not the entire /app
# The app files don't need to be owned by abc, just readable
echo "[init] Setting ownership of /app/.next/cache to abc:abc (if exists)"
mkdir -p /app/.next/cache 2>/dev/null || true
chown -R abc:abc /app/.next/cache 2>/dev/null || true

echo "[init] User/group setup complete"
