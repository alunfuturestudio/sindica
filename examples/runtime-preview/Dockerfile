FROM node:20-bookworm

ENV CODEX_HOME=/home/node/.codex \
    PREVIEW_ROOT=/preview-data \
    PREVIEW_PORT_START=31000 \
    PREVIEW_PORT_COUNT=1000 \
    PREVIEW_TTL_HOURS=24 \
    PREVIEW_HOST=localhost \
    PREVIEW_HEALTH_PATH=/ \
    PREVIEW_INSTALL_COMMAND="" \
    PREVIEW_BUILD_COMMAND="" \
    PREVIEW_MIGRATE_COMMAND="" \
    PREVIEW_START_COMMAND="python3 -m http.server ${PORT:-3000} --bind 0.0.0.0" \
    PNPM_HOME=/usr/local/share/pnpm

ENV PATH="${PNPM_HOME}:${PATH}"

RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    curl \
    git \
    jq \
    lsof \
    procps \
    python3 \
  && rm -rf /var/lib/apt/lists/*

RUN corepack disable \
  && npm install -g \
    @openai/codex \
    pnpm@9.12.3 \
  && npm install -g https://github.com/alunfuturestudio/sindica/archive/refs/heads/main.tar.gz \
  && npm cache clean --force

RUN mkdir -p /home/node/.codex /preview-data /workspace/app /usr/local/lib/sindica-preview \
  && chown -R node:node /home/node /preview-data /workspace

COPY preview-common.sh /usr/local/lib/sindica-preview/preview-common.sh
COPY preview /usr/local/bin/preview
COPY preview-start /usr/local/bin/preview-start
COPY preview-stop /usr/local/bin/preview-stop
COPY preview-status /usr/local/bin/preview-status
COPY preview-gc /usr/local/bin/preview-gc

RUN chmod +x \
    /usr/local/bin/preview \
    /usr/local/bin/preview-start \
    /usr/local/bin/preview-stop \
    /usr/local/bin/preview-status \
    /usr/local/bin/preview-gc \
  && chmod 644 /usr/local/lib/sindica-preview/preview-common.sh

USER node
WORKDIR /workspace/app

CMD ["bash"]
