FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
  bash \
  build-essential \
  ca-certificates \
  curl \
  fd-find \
  git \
  gnupg \
  python3 \
  ripgrep \
  unzip \
  && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
  apt-get update && \
  apt-get install -y --no-install-recommends nodejs && \
  rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://bun.sh/install | bash && \
  ln -sf /root/.bun/bin/bun /usr/local/bin/bun && \
  npm install -g pnpm && \
  ln -sf /usr/bin/fdfind /usr/local/bin/fd

RUN useradd --create-home --shell /bin/bash agent

USER agent
WORKDIR /workspace

CMD ["sleep", "infinity"]
