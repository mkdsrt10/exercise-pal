# MinIO no longer publishes public container images and its repository is archived,
# so build the last community release from source. The app only speaks the S3 API,
# so this service can be replaced with any S3-compatible store.
FROM golang:1.24-alpine AS build
ARG MINIO_RELEASE=RELEASE.2025-10-15T17-29-55Z
RUN apk add --no-cache git && \
    CGO_ENABLED=0 go install github.com/minio/minio@${MINIO_RELEASE}

FROM alpine:3.22
RUN apk add --no-cache ca-certificates curl
COPY --from=build /go/bin/minio /usr/bin/minio
EXPOSE 9000 9001
ENTRYPOINT ["minio"]
