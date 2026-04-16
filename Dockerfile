FROM docker:28-cli AS docker-cli

FROM oven/bun:1

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker

COPY . .

RUN bun install
RUN bun run build

CMD ["bun", "run", "start"]
