# https://hub.docker.com/_/rust?tab=tags
FROM rust:1.37.0 as builder

# musl-gcc
RUN apt-get update \
	&& apt-get install -y \
		musl-dev \
		musl-tools \
		ca-certificates \
	&& apt-get clean \
	&& rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN rustup target add x86_64-unknown-linux-musl
# cache deps https://blog.jawg.io/docker-multi-stage-build/
# RUN USER=root cargo init
# COPY Cargo.toml .
# RUN cargo build --target x86_64-unknown-linux-musl --release
# COPY src src
COPY . .
RUN cargo build --target x86_64-unknown-linux-musl --release
RUN strip /app/target/x86_64-unknown-linux-musl/release/action-gh-release

FROM scratch

# https://help.github.com/en/articles/metadata-syntax-for-github-actions#about-yaml-syntax-for-github-actions
LABEL version="0.1.0" \
  repository="https://github.com/meetup/action-gh-release/" \
  homepage="https://github.com/meetup/action-gh-release" \
  maintainer="Meetup" \
  "com.github.actions.name"="GH-Release" \
  "com.github.actions.description"="Creates a new Github Release" \
  "com.github.actions.icon"="package" \
  "com.github.actions.color"="green"

COPY --from=builder \
	/etc/ssl/certs/ca-certificates.crt \
	/etc/ssl/certs/
COPY --from=builder \
	/app/target/x86_64-unknown-linux-musl/release/action-gh-release \
	/action-gh-release
ENTRYPOINT ["/action-gh-release"]