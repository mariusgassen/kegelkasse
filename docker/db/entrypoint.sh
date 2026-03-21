#!/bin/sh
set -e

# Fix ownership of the pgbackrest repo volume.
# Docker named volumes default to root:root — pgbackrest runs as the postgres
# user via gosu and needs write access to create archive/backup paths.
mkdir -p /pgbackrest
chown -R postgres:postgres /pgbackrest

# Start pgbackrest management API in the background.
# Runs as root; uses gosu internally to call pgbackrest as the postgres user.
python3 /usr/local/bin/pgb_mgmt.py &

# Delegate to the official PostgreSQL entrypoint
exec /usr/local/bin/docker-entrypoint.sh "$@"
