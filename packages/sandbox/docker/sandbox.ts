import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { Dirent } from "node:fs";
import { posix } from "node:path";
import type {
  ExecResult,
  Sandbox,
  SandboxHooks,
  SandboxStats,
  SnapshotResult,
} from "../interface";
import {
  DEFAULT_DOCKER_WORKING_DIRECTORY,
  SANDBOX_CONTAINER_USER,
} from "./config";
import { releasePort } from "./port-allocator";
import type { DockerState } from "./state";
import { shellQuote } from "./git-credentials";

const MAX_OUTPUT_LENGTH = 50_000;

interface RunDockerOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  input?: string;
}

interface RunDockerResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  aborted: boolean;
}

function createAbortError(): Error {
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}

function generateCommandId(): string {
  return randomUUID().replaceAll("-", "").slice(0, 21);
}

function runDockerCommand(
  args: string[],
  options: RunDockerOptions = {},
): Promise<RunDockerResult> {
  return (async () => {
    const child = spawn("docker", args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    let timedOut = false;
    let aborted = false;
    let spawnError: Error | null = null;

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdoutChunks.push(chunk.toString());
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderrChunks.push(chunk.toString());
    });

    if (options.input !== undefined) {
      child.stdin.write(options.input);
    }
    child.stdin.end();

    const timeoutId =
      options.timeoutMs !== undefined
        ? setTimeout(() => {
            timedOut = true;
            child.kill("SIGTERM");
          }, options.timeoutMs)
        : undefined;

    const onAbort = () => {
      aborted = true;
      child.kill("SIGTERM");
    };

    if (options.signal) {
      if (options.signal.aborted) {
        onAbort();
      } else {
        options.signal.addEventListener("abort", onAbort, { once: true });
      }
    }

    let exitCode: number | null = null;
    try {
      const [closeCode] = (await once(child, "close")) as [number | null];
      exitCode = closeCode;
    } catch (error) {
      spawnError = error instanceof Error ? error : new Error(String(error));
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (options.signal) {
        options.signal.removeEventListener("abort", onAbort);
      }
    }

    const stdout = stdoutChunks.join("");
    const stderrFromOutput = stderrChunks.join("");
    const stderr = stderrFromOutput || (spawnError ? spawnError.message : "");

    return {
      exitCode,
      stdout,
      stderr,
      timedOut,
      aborted,
    };
  })();
}

function buildDirent(path: string, line: string): Dirent {
  const [type, name = ""] = line.split("\t");
  const isDir = type === "d";
  const isFile = type === "f";
  const isSymbolicLink = type === "l";

  return {
    name,
    parentPath: path,
    path,
    isDirectory: () => isDir,
    isFile: () => isFile,
    isSymbolicLink: () => isSymbolicLink,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
  } as Dirent;
}

export class DockerSandbox implements Sandbox {
  readonly type = "docker" as const;
  readonly workingDirectory = DEFAULT_DOCKER_WORKING_DIRECTORY;
  readonly env?: Record<string, string>;
  readonly currentBranch?: string;
  readonly hooks?: SandboxHooks;
  readonly host = "localhost";
  readonly containerName: string;
  readonly volumeName: string;
  readonly ports: number[];
  private hostPortMap: Record<number, number>;
  private timeoutTimer?: ReturnType<typeof setTimeout>;
  private _timeout?: number;
  private _expiresAt?: number;
  private isStopped = false;
  private didReleasePorts = false;

  constructor(options: {
    state: DockerState;
    env?: Record<string, string>;
    currentBranch?: string;
    hooks?: SandboxHooks;
    timeout?: number;
  }) {
    this.containerName = options.state.containerName;
    this.volumeName = options.state.volumeName;
    this.ports = options.state.ports;
    this.hostPortMap = options.state.hostPortMap;
    this.env = options.env;
    this.currentBranch = options.currentBranch;
    this.hooks = options.hooks;
    this._timeout = options.timeout;
    if (options.timeout !== undefined) {
      this._expiresAt = Date.now() + options.timeout;
      this.scheduleTimeoutHook();
    }
  }

  get environmentDetails(): string {
    const portLines = this.ports
      .map((port) => {
        try {
          return `  - Port ${port}: ${this.domain(port)}`;
        } catch {
          return undefined;
        }
      })
      .filter((line): line is string => line !== undefined);

    const portSection =
      portLines.length > 0
        ? `\n- Dev server URLs for local sandbox ports:\n${portLines.join("\n")}`
        : "";

    return `- Sandbox runs in a local Docker container
- All commands already run in the working directory by default
- Use workspace-relative paths for read/write/search/edit operations
- Git is configured for the authenticated user${portSection}`;
  }

  get timeout(): number | undefined {
    return this._timeout;
  }

  get expiresAt(): number | undefined {
    return this._expiresAt;
  }

  private scheduleTimeoutHook(): void {
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = undefined;
    }
    if (this._expiresAt === undefined) {
      return;
    }

    const msUntilTimeout = this._expiresAt - Date.now();
    if (msUntilTimeout <= 0) {
      return;
    }

    this.timeoutTimer = setTimeout(() => {
      void this.hooks?.onTimeout?.(this).catch((error) => {
        console.error(
          "[DockerSandbox] onTimeout hook failed:",
          error instanceof Error ? error.message : error,
        );
      });
    }, msUntilTimeout);
  }

  private getDockerExecEnvArgs(): string[] {
    const runtimePreviewEnv = Object.fromEntries(
      Object.entries(this.hostPortMap).map(([port, hostPort]) => [
        `SANDBOX_URL_${port}`,
        `http://localhost:${hostPort}`,
      ]),
    );
    const env = {
      ...this.env,
      SANDBOX_HOST: "localhost",
      ...runtimePreviewEnv,
    };

    return Object.entries(env).flatMap(([key, value]) => [
      "-e",
      `${key}=${value}`,
    ]);
  }

  private async runContainerCommand(
    command: string,
    options: RunDockerOptions & { cwd?: string } = {},
  ): Promise<RunDockerResult> {
    const args = [
      "exec",
      "-u",
      SANDBOX_CONTAINER_USER,
      ...(options.cwd ? ["-w", options.cwd] : []),
      ...this.getDockerExecEnvArgs(),
      ...(options.input !== undefined ? ["-i"] : []),
      this.containerName,
      "sh",
      "-c",
      command,
    ];

    return runDockerCommand(args, options);
  }

  async readFile(path: string, _encoding: "utf-8"): Promise<string> {
    const result = await this.runContainerCommand(`cat ${shellQuote(path)}`);
    if (result.exitCode !== 0) {
      throw new Error(
        result.stderr || `Failed to read file from sandbox: ${path}`,
      );
    }
    return result.stdout;
  }

  async writeFile(
    path: string,
    content: string,
    _encoding: "utf-8",
  ): Promise<void> {
    const parentDir = posix.dirname(path);
    if (parentDir && parentDir !== ".") {
      await this.mkdir(parentDir, { recursive: true });
    }

    const result = await this.runContainerCommand(
      `tee ${shellQuote(path)} > /dev/null`,
      { input: content },
    );
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || `Failed to write file: ${path}`);
    }
  }

  async stat(path: string): Promise<SandboxStats> {
    const result = await this.runContainerCommand(
      `stat -c '%F\t%s\t%Y' ${shellQuote(path)}`,
    );
    if (result.exitCode !== 0) {
      throw new Error(`ENOENT: no such file or directory, stat '${path}'`);
    }

    const [fileType = "", sizeRaw = "0", mtimeRaw = "0"] = result.stdout
      .trim()
      .split("\t");
    const size = Number.parseInt(sizeRaw, 10);
    const mtimeMs = Number.parseInt(mtimeRaw, 10) * 1000;

    return {
      isDirectory: () => fileType === "directory",
      isFile: () => fileType === "regular file",
      size: Number.isFinite(size) ? size : 0,
      mtimeMs: Number.isFinite(mtimeMs) ? mtimeMs : 0,
    };
  }

  async access(path: string): Promise<void> {
    const result = await this.runContainerCommand(
      `test -e ${shellQuote(path)}`,
    );
    if (result.exitCode !== 0) {
      throw new Error(`ENOENT: no such file or directory, access '${path}'`);
    }
  }

  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    const recursiveFlag = options?.recursive ? "-p " : "";
    const result = await this.runContainerCommand(
      `mkdir ${recursiveFlag}${shellQuote(path)}`,
    );
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || `Failed to create directory: ${path}`);
    }
  }

  async readdir(
    path: string,
    _options: { withFileTypes: true },
  ): Promise<Dirent[]> {
    const result = await this.runContainerCommand(
      `find ${shellQuote(path)} -maxdepth 1 -mindepth 1 -printf '%y\t%f\n'`,
    );
    if (result.exitCode !== 0) {
      throw new Error(`ENOENT: no such file or directory, scandir '${path}'`);
    }

    const output = result.stdout.trim();
    if (!output) {
      return [];
    }

    return output.split("\n").map((line) => buildDirent(path, line));
  }

  async exec(
    command: string,
    cwd: string,
    timeoutMs: number,
    options?: { signal?: AbortSignal },
  ): Promise<ExecResult> {
    const result = await this.runContainerCommand(command, {
      cwd,
      timeoutMs,
      signal: options?.signal,
    });

    if (result.aborted && options?.signal?.aborted) {
      throw createAbortError();
    }

    let stdout = result.stdout;
    let stderr = result.stderr;
    let truncated = false;
    if (stdout.length > MAX_OUTPUT_LENGTH) {
      stdout = stdout.slice(0, MAX_OUTPUT_LENGTH);
      truncated = true;
    }
    if (stderr.length > MAX_OUTPUT_LENGTH) {
      stderr = stderr.slice(0, MAX_OUTPUT_LENGTH);
      truncated = true;
    }

    if (result.timedOut) {
      return {
        success: false,
        exitCode: null,
        stdout,
        stderr: `Command timed out after ${timeoutMs}ms`,
        truncated,
      };
    }

    return {
      success: result.exitCode === 0,
      exitCode: result.exitCode,
      stdout,
      stderr,
      truncated,
    };
  }

  async execDetached(
    command: string,
    cwd: string,
  ): Promise<{ commandId: string }> {
    const args = [
      "exec",
      "-d",
      "-u",
      SANDBOX_CONTAINER_USER,
      "-w",
      cwd,
      ...this.getDockerExecEnvArgs(),
      this.containerName,
      "sh",
      "-c",
      command,
    ];
    const result = await runDockerCommand(args, { timeoutMs: 15_000 });

    if (result.exitCode !== 0) {
      throw new Error(
        result.stderr ||
          result.stdout ||
          "Detached command failed to start in Docker sandbox.",
      );
    }

    return { commandId: generateCommandId() };
  }

  domain(port: number): string {
    const hostPort = this.hostPortMap[port];
    if (!hostPort) {
      throw new Error(`No host port mapping exists for sandbox port ${port}.`);
    }
    return `http://localhost:${hostPort}`;
  }

  async stop(): Promise<void> {
    if (this.isStopped) {
      return;
    }
    this.isStopped = true;
    this._expiresAt = undefined;
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = undefined;
    }

    if (this.hooks?.beforeStop) {
      try {
        await this.hooks.beforeStop(this);
      } catch (error) {
        console.error(
          "[DockerSandbox] beforeStop hook failed:",
          error instanceof Error ? error.message : error,
        );
      }
    }

    await runDockerCommand(["stop", this.containerName], { timeoutMs: 30_000 });
    await runDockerCommand(["rm", this.containerName], { timeoutMs: 30_000 });

    if (!this.didReleasePorts) {
      for (const hostPort of Object.values(this.hostPortMap)) {
        releasePort(hostPort);
      }
      this.didReleasePorts = true;
      this.hostPortMap = {};
    }
  }

  async snapshot(): Promise<SnapshotResult> {
    return { snapshotId: this.volumeName };
  }

  async extendTimeout(additionalMs: number): Promise<{ expiresAt: number }> {
    const baseline = this._expiresAt ?? Date.now();
    this._expiresAt = baseline + additionalMs;
    this.scheduleTimeoutHook();

    if (this.hooks?.onTimeoutExtended) {
      try {
        await this.hooks.onTimeoutExtended(this, additionalMs);
      } catch (error) {
        console.error(
          "[DockerSandbox] onTimeoutExtended hook failed:",
          error instanceof Error ? error.message : error,
        );
      }
    }

    return { expiresAt: this._expiresAt };
  }

  getState(): { type: "docker" } & DockerState {
    return {
      type: "docker",
      containerName: this.containerName,
      volumeName: this.volumeName,
      ports: this.ports,
      hostPortMap: this.hostPortMap,
    };
  }
}
