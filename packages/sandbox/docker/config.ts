export const DEFAULT_DOCKER_IMAGE =
  process.env.DOCKER_SANDBOX_IMAGE ?? "open-agents-sandbox:base";

export const SANDBOX_CONTAINER_USER =
  process.env.DOCKER_SANDBOX_CONTAINER_USER ?? "agent";

export const DEFAULT_DOCKER_WORKING_DIRECTORY = "/workspace";
export const DOCKER_HOST_PORT_RANGE_START = 20_000;
export const DOCKER_HOST_PORT_RANGE_END = 30_000;
