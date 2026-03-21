FROM postgres:16-alpine

# Pull pgbackrest and Python from Alpine edge so we get the latest releases
# (edge community = pgbackrest ≥ 2.58; edge main = Python ≥ 3.14).
# Using tagged repos keeps all other packages on the stable Alpine base.
RUN echo "@edgec https://dl-cdn.alpinelinux.org/alpine/edge/community" >> /etc/apk/repositories \
 && echo "@edgem https://dl-cdn.alpinelinux.org/alpine/edge/main"      >> /etc/apk/repositories \
 && apk add --no-cache pgbackrest@edgec python3@edgem

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
