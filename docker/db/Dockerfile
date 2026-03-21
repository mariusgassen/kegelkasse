FROM postgres:16-alpine

# Install pgbackrest and Python (for management API)
RUN apk add --no-cache pgbackrest python3

# pgbackrest static config (stanza + WAL settings; repo path etc. via env vars)
COPY pgbackrest.conf /etc/pgbackrest/pgbackrest.conf

# Management HTTP API (triggered by app to run pgbackrest commands)
COPY mgmt_server.py /usr/local/bin/pgb_mgmt.py

# Init script: creates the pgbackrest stanza on first DB init
COPY init-pgbackrest.sh /docker-entrypoint-initdb.d/01-pgbackrest.sh
RUN chmod +x /docker-entrypoint-initdb.d/01-pgbackrest.sh

# Custom entrypoint: starts mgmt server then delegates to postgres entrypoint
COPY entrypoint.sh /pgb-entrypoint.sh
RUN chmod +x /pgb-entrypoint.sh

ENTRYPOINT ["/pgb-entrypoint.sh"]
CMD ["postgres"]
