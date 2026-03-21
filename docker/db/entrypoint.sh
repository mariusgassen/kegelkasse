#!/bin/sh
set -e

# Start pgbackrest management API in the background.
# Runs as root; uses gosu internally to call pgbackrest as the postgres user.
python3 /usr/local/bin/pgb_mgmt.py &

# Delegate to the official PostgreSQL entrypoint
exec /usr/local/bin/docker-entrypoint.sh "$@"
