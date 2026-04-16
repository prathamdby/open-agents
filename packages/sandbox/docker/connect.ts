import { spawn } from "node:child_process";
import type { Sandbox, SandboxHooks } from "../interface";
import type { Source } from "../types";
import {
  DEFAULT_DOCKER_IMAGE,
  DEFAULT_DOCKER_WORKING_DIRECTORY,
  SANDBOX_CONTAINER_USER,
} from "./config";
import { buildGitCredentialSetupScript, shellQuote } from "./git-credentials";
import { allocatePort, releasePort, reservePort } from "./port-allocator";
import { DockerSandbox } from "./sandbox";
import type { DockerState } from "./state";

interface ConnectOptions {
  env?: Record<string, string>;
  githubToken?: string;
  gitUser?: { name: string; email: string };
  hooks?: SandboxHooks;
  timeout?: number;
  ports?: number[];
  resume?: boolean;
  source?: Source;
  skipGitWorkspaceBootstrap?: boolean;
}

interface DockerCommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

function runDockerCommand(
  args: string[],
  options: { input?: string } = {},
): Promise<DockerCommandResult> {
  return new Promise((resolve) => {
    const child = spawn("docker", args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    let spawnError: Error | null = null;

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdoutChunks.push(chunk.toString());
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderrChunks.push(chunk.toString());
    });
    child.on("error", (error) => {
      spawnError = error;
    });

    if (options.input !== undefined) {
      child.stdin.write(options.input);
    }
    child.stdin.end();

    child.on("close", (exitCode) => {
      const stdout = stdoutChunks.join("");
      const stderrFromOutput = stderrChunks.join("");
      const stderr = stderrFromOutput || (spawnError ? spawnError.message : "");
      resolve({
        exitCode,
        stdout,
        stderr,
      });
    });
  });
}

async function runDockerCommandOrThrow(
  args: string[],
  errorMessage: string,
  options: { input?: string } = {},
): Promise<DockerCommandResult> {
  const result = await runDockerCommand(args, options);
  if (result.exitCode !== 0) {
    throw new Error(`${errorMessage}: ${result.stderr || result.stdout}`);
  }
  return result;
}

async function ensureVolume(volumeName: string): Promise<void> {
  const inspectResult = await runDockerCommand([
    "volume",
    "inspect",
    volumeName,
  ]);
  if (inspectResult.exitCode === 0) {
    return;
  }

  await runDockerCommandOrThrow(
    ["volume", "create", volumeName],
    `Failed to create Docker volume ${volumeName}`,
  );
}

async function getContainerStatus(
  containerName: string,
): Promise<"missing" | "running" | "stopped"> {
  const statusResult = await runDockerCommand([
    "container",
    "inspect",
    "--format",
    "{{.State.Status}}",
    containerName,
  ]);
  if (statusResult.exitCode !== 0) {
    return "missing";
  }

  return statusResult.stdout.trim() === "running" ? "running" : "stopped";
}

async function inspectHostPortMap(
  containerName: string,
  ports: number[],
): Promise<Record<number, number>> {
  const inspectResult = await runDockerCommand([
    "container",
    "inspect",
    "--format",
    "{{json .NetworkSettings.Ports}}",
    containerName,
  ]);
  if (inspectResult.exitCode !== 0) {
    return {};
  }

  try {
    const parsed = JSON.parse(inspectResult.stdout) as Record<
      string,
      Array<{
        HostPort?: string;
      }> | null
    >;

    const hostPortMap: Record<number, number> = {};
    for (const port of ports) {
      const bindings = parsed[`${port}/tcp`];
      const hostPort = bindings?.[0]?.HostPort;
      const parsedHostPort = hostPort ? Number.parseInt(hostPort, 10) : NaN;
      if (Number.isInteger(parsedHostPort) && parsedHostPort > 0) {
        hostPortMap[port] = parsedHostPort;
      }
    }

    return hostPortMap;
  } catch {
    return {};
  }
}

function buildPortArgs(hostPortMap: Record<number, number>): string[] {
  return Object.entries(hostPortMap).flatMap(([containerPort, hostPort]) => [
    "-p",
    `${hostPort}:${containerPort}`,
  ]);
}

function buildEnvArgs(env: Record<string, string> | undefined): string[] {
  if (!env) {
    return [];
  }
  return Object.entries(env).flatMap(([key, value]) => [
    "-e",
    `${key}=${value}`,
  ]);
}

async function allocateHostPortMap(ports: number[]): Promise<{
  hostPortMap: Record<number, number>;
  allocatedHostPorts: number[];
}> {
  const hostPortMap: Record<number, number> = {};
  const allocatedHostPorts: number[] = [];

  for (const port of ports) {
    const hostPort = await allocatePort();
    allocatedHostPorts.push(hostPort);
    hostPortMap[port] = hostPort;
  }

  return { hostPortMap, allocatedHostPorts };
}

function releaseHostPorts(hostPorts: number[]): void {
  for (const hostPort of hostPorts) {
    releasePort(hostPort);
  }
}

function reserveHostPorts(hostPortMap: Record<number, number>): void {
  for (const hostPort of Object.values(hostPortMap)) {
    reservePort(hostPort);
  }
}

function getSourceCloneUrl(source: Source, githubToken?: string): string {
  const authToken = githubToken ?? source.token;
  if (!authToken) {
    return source.repo;
  }

  try {
    const url = new URL(source.repo);
    url.username = "x-access-token";
    url.password = authToken;
    return url.toString();
  } catch {
    return source.repo;
  }
}

async function runInContainer(
  containerName: string,
  command: string,
): Promise<DockerCommandResult> {
  return runDockerCommand([
    "exec",
    "-u",
    SANDBOX_CONTAINER_USER,
    containerName,
    "sh",
    "-c",
    command,
  ]);
}

async function ensureWorkspaceOwnedBySandboxUser(
  containerName: string,
): Promise<void> {
  const ws = shellQuote(DEFAULT_DOCKER_WORKING_DIRECTORY);
  const owner = shellQuote(`${SANDBOX_CONTAINER_USER}:${SANDBOX_CONTAINER_USER}`);
  await runDockerCommandOrThrow(
    [
      "exec",
      "-u",
      "0",
      containerName,
      "sh",
      "-c",
      `chown -R ${owner} ${ws} || chown -R 1000:1000 ${ws}`,
    ],
    "Failed to fix workspace permissions in Docker sandbox",
  );
}

async function runInContainerOrThrow(
  containerName: string,
  command: string,
  errorMessage: string,
): Promise<void> {
  const result = await runInContainer(containerName, command);
  if (result.exitCode !== 0) {
    throw new Error(`${errorMessage}: ${result.stderr || result.stdout}`);
  }
}

async function isWorkspaceEmpty(containerName: string): Promise<boolean> {
  const result = await runInContainer(
    containerName,
    `ls -A ${shellQuote(DEFAULT_DOCKER_WORKING_DIRECTORY)}`,
  );
  return result.exitCode === 0 && result.stdout.trim().length === 0;
}

async function bootstrapWorkspace(
  containerName: string,
  options: ConnectOptions,
): Promise<void> {
  const workspaceIsEmpty = await isWorkspaceEmpty(containerName);
  if (!workspaceIsEmpty) {
    return;
  }

  if (options.source) {
    const cloneUrl = getSourceCloneUrl(options.source, options.githubToken);
    const branchArg = options.source.branch
      ? ` --branch ${shellQuote(options.source.branch)}`
      : "";
    await runInContainerOrThrow(
      containerName,
      `cd ${shellQuote(DEFAULT_DOCKER_WORKING_DIRECTORY)} && git clone${branchArg} ${shellQuote(cloneUrl)} .`,
      "Failed to clone repository in Docker sandbox",
    );

    if (options.source.newBranch) {
      await runInContainerOrThrow(
        containerName,
        `cd ${shellQuote(DEFAULT_DOCKER_WORKING_DIRECTORY)} && git checkout -b ${shellQuote(options.source.newBranch)}`,
        "Failed to create branch in Docker sandbox",
      );
    }
    return;
  }

  if (options.skipGitWorkspaceBootstrap) {
    return;
  }

  await runInContainerOrThrow(
    containerName,
    `cd ${shellQuote(DEFAULT_DOCKER_WORKING_DIRECTORY)} && git init`,
    "Failed to initialize git repository in Docker sandbox",
  );

  if (options.gitUser) {
    await runInContainerOrThrow(
      containerName,
      `cd ${shellQuote(DEFAULT_DOCKER_WORKING_DIRECTORY)} && git commit --allow-empty -m 'Initial commit'`,
      "Failed to create initial commit in Docker sandbox",
    );
  }
}

async function detectCurrentBranch(
  containerName: string,
): Promise<string | undefined> {
  const branchResult = await runInContainer(
    containerName,
    `cd ${shellQuote(DEFAULT_DOCKER_WORKING_DIRECTORY)} && git symbolic-ref --short HEAD`,
  );
  if (branchResult.exitCode !== 0) {
    return undefined;
  }
  const branch = branchResult.stdout.trim();
  return branch.length > 0 ? branch : undefined;
}

export async function connectDocker(
  state: DockerState,
  options: ConnectOptions = {},
): Promise<Sandbox> {
  const ports = state.ports.length > 0 ? state.ports : (options.ports ?? []);
  const image = DEFAULT_DOCKER_IMAGE;
  const mergedState: DockerState = {
    ...state,
    ports,
  };

  let hostPortMap: Record<number, number> = { ...state.hostPortMap };
  let allocatedHostPorts: number[] = [];
  let createdContainer = false;

  try {
    const containerStatus = await getContainerStatus(state.containerName);
    if (containerStatus === "missing") {
      releaseHostPorts(Object.values(state.hostPortMap));
      await ensureVolume(state.volumeName);

      const allocation = await allocateHostPortMap(ports);
      hostPortMap = allocation.hostPortMap;
      allocatedHostPorts = allocation.allocatedHostPorts;

      await runDockerCommandOrThrow(
        [
          "run",
          "-d",
          "--name",
          state.containerName,
          "-v",
          `${state.volumeName}:${DEFAULT_DOCKER_WORKING_DIRECTORY}`,
          "-w",
          DEFAULT_DOCKER_WORKING_DIRECTORY,
          ...buildPortArgs(hostPortMap),
          ...buildEnvArgs(options.env),
          image,
          "sleep",
          "infinity",
        ],
        `Failed to start Docker sandbox container ${state.containerName}`,
      );
      createdContainer = true;
    } else {
      if (containerStatus === "stopped") {
        await runDockerCommandOrThrow(
          ["start", state.containerName],
          `Failed to start existing Docker sandbox ${state.containerName}`,
        );
      }

      const inspectedHostPortMap = await inspectHostPortMap(
        state.containerName,
        ports,
      );
      hostPortMap = {
        ...state.hostPortMap,
        ...inspectedHostPortMap,
      };
      reserveHostPorts(hostPortMap);
    }

    if (createdContainer || options.resume) {
      await ensureWorkspaceOwnedBySandboxUser(state.containerName);

      const credentialScript = buildGitCredentialSetupScript({
        githubToken: options.githubToken,
        gitUser: options.gitUser,
      });
      if (credentialScript) {
        await runInContainerOrThrow(
          state.containerName,
          credentialScript,
          "Failed to configure git credentials in Docker sandbox",
        );
      }

      await bootstrapWorkspace(state.containerName, options);
    }

    const currentBranch = await detectCurrentBranch(state.containerName);
    const sandbox = new DockerSandbox({
      state: {
        ...mergedState,
        hostPortMap,
      },
      env: options.env,
      hooks: options.hooks,
      timeout: options.timeout,
      currentBranch,
    });

    if (options.hooks?.afterStart) {
      await options.hooks.afterStart(sandbox);
    }

    return sandbox;
  } catch (error) {
    if (createdContainer) {
      await runDockerCommand(["rm", "-f", state.containerName]);
    }
    releaseHostPorts(allocatedHostPorts);
    throw error;
  }
}
