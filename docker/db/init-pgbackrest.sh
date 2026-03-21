#!/bin/bash
# Runs as the postgres user during DB initialization (docker-entrypoint-initdb.d).
# Creates the pgbackrest stanza for the 'main' cluster.
set -e

echo "Initializing pgbackrest stanza..."
pgbackrest --stanza=main stanza-create --log-level-stderr=info
echo "pgbackrest stanza ready."
