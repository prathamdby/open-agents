# Open Agents (Self-Hosted Fork)

Single-user Open Agents fork for localhost use.

## Prerequisites

- Docker
- A GitHub personal access token with repo access
- An OpenAI-compatible gateway URL and API key
- Enough local disk space to build Docker images

## Quick Start

1. Copy `.env.example` to `.env` and set values.
2. Build the sandbox base image:

```bash
docker build -t open-agents-sandbox:base packages/sandbox/docker/base
```

3. Start the stack:

```bash
docker compose up --build
```

Open `http://127.0.0.1:3000`.

## Services

- `postgres`: database (`postgres:16-alpine`)
- `web`: Next.js app, bound to `127.0.0.1:3000`
- `workflow-worker`: second process for workflow runtime using the same Postgres

`web` and `workflow-worker` use the same image. The worker command is `bun run start:worker`.

## Environment Variables

Required:

```env
GITHUB_PAT=
AI_GATEWAY_BASE_URL=
AI_GATEWAY_API_KEY=
AI_DEFAULT_MODEL_ID=
GIT_USER_NAME=
GIT_USER_EMAIL=
```

Optional:

```env
AI_MODELS_JSON=
DOCKER_SANDBOX_IMAGE=open-agents-sandbox:base
DOCKER_SANDBOX_CONTAINER_USER=agent
```

`DOCKER_SANDBOX_CONTAINER_USER` must match the non-root user in your sandbox image (the base Dockerfile uses `agent`). On connect, the runtime runs `chown -R` on `/workspace` as root so named volumes (often created root-owned) stay writable for `git` and file tools.

Compose-managed:

```env
POSTGRES_URL=postgres://openagents:openagents@postgres:5432/openagents
SANDBOX_BACKEND=docker
```

`AI_GATEWAY_BASE_URL` must be an **OpenAI-compatible** API root (the app uses Chat Completions), for example `https://opencode.ai/zen/go/v1` so requests go to `…/v1/chat/completions`. It is not the Vercel AI Gateway wire protocol. If `GET …/models` is missing, set `AI_MODELS_JSON` so the model picker still works.

## Useful Commands

```bash
bun run typecheck
bun run check
bun run ci
```
