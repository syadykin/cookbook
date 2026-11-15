FROM node:24 AS node-stage

WORKDIR /app
COPY ./ui /app/ui

COPY ./openapi.yaml /app
COPY ./Makefile /app
RUN make ui-build

FROM golang:1.26 AS go-stage

WORKDIR /app

# data directory for media files and database
RUN mkdir -p /data && chmod 777 /data

# install build dependencies
COPY ./go.mod ./go.sum ./
RUN go mod download

# copy built ui
COPY --from=node-stage /app/ui/dist /app/ui/dist

# build binary
COPY --exclude=./ui --exclude=./docker . /app
RUN mkdir dist && \
    make go-build && \
    strip cookbook && \
     mv cookbook dist/

# uploads stream through a temp file, and the final image is FROM scratch: without this there is
# no /tmp in it and every upload fails on a directory that does not exist
RUN mkdir -m 1777 -p dist/tmp

# install library dependencies
RUN ldd ./dist/cookbook  | grep -o '/lib[^ ]*' | xargs -I '{}' install -D -m755 '{}' dist/'{}'

# install CA certificates
RUN /usr/sbin/update-ca-certificates --fresh && \
    mkdir -p dist/usr/share && \
    cp -ra /usr/share/ca-certificates dist/usr/share/ca-certificates && \
    mkdir -p dist/etc/ssl && \
    cp -ra /etc/ssl/certs dist/etc/ssl/certs

FROM scratch

ENV GIN_MODE=release

COPY --from=go-stage /app/dist /
COPY ./config.yaml /config.yaml

WORKDIR /
CMD [ "/cookbook", "-c", "config.yaml" ]
VOLUME [ "/data" ]

EXPOSE 3000
