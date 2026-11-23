# syntax=docker/dockerfile:1
# Requires BuildKit. Build from the repository root:
#   docker build -f app/packages/referee-node/Dockerfile -t wwd-referee .

FROM node:24-bookworm-slim AS builder
SHELL ["/bin/bash", "-o", "pipefail", "-c"]
RUN apt-get update \
  && apt-get install -y --no-install-recommends build-essential ca-certificates curl pkg-config \
  && rm -rf /var/lib/apt/lists/*
ENV RUSTUP_HOME=/usr/local/rustup CARGO_HOME=/usr/local/cargo PATH=/usr/local/cargo/bin:$PATH
RUN curl -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain none
COPY engine/rust-toolchain.toml /tmp/rust-toolchain.toml
RUN cd /tmp && rustup toolchain install \
  && rustup default "$(sed -n 's/^channel = "\(.*\)"/\1/p' rust-toolchain.toml)"
# Keep in step with the wasm-bindgen version pinned by the wwd-wasm crate.
RUN cargo install wasm-bindgen-cli --version 0.2.129 --locked
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

WORKDIR /src
COPY engine engine
COPY app app
WORKDIR /src/app
RUN pnpm install --frozen-lockfile --filter "@wwd/referee-node..."
RUN pnpm --filter "@wwd/referee-node..." build
RUN pnpm --filter @wwd/referee-node deploy --prod --legacy /out

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /srv/referee
COPY --from=builder --chown=node:node /out ./
RUN mkdir -p /data && chown node:node /data
VOLUME /data
USER node
EXPOSE 8787
ENTRYPOINT ["node", "dist/cli.js", "--host", "0.0.0.0", "--port", "8787", "--data", "/data"]
CMD []
