# Rebuild gosu against a patched Go stdlib (≥ 1.26.9) so the DB image has no Go stdlib CVEs.
FROM golang:1.27-alpine AS gosu-builder
ARG GOSU_VERSION=1.20
RUN apk add --no-cache git ca-certificates \
 && git clone --depth 1 --branch "${GOSU_VERSION}" https://github.com/tianon/gosu.git /src \
 && cd /src \
 && CGO_ENABLED=0 go build -v -trimpath -ldflags '-d -w' -o /usr/local/bin/gosu . \
 && /usr/local/bin/gosu --version

FROM postgres:16-alpine

COPY --from=gosu-builder /usr/local/bin/gosu /usr/local/bin/gosu

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
