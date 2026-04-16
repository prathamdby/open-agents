import type { SandboxState } from "@open-harness/sandbox";
import { SANDBOX_EXPIRES_BUFFER_MS } from "./config";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function getSandboxExpiresAt(state: unknown): number | undefined {
  if (!isRecord(state)) {
    return undefined;
  }
  const expiresAt = state.expiresAt;
  return typeof expiresAt === "number" ? expiresAt : undefined;
}

function getLegacySandboxId(state: unknown): string | null {
  if (!isRecord(state)) {
    return null;
  }

  const sandboxId = (state as { sandboxId?: unknown }).sandboxId;
  return hasNonEmptyString(sandboxId) ? sandboxId : null;
}

export function getSessionSandboxName(sessionId: string): string {
  return `session_${sessionId}`;
}

export function getPersistentSandboxName(state: unknown): string | null {
  if (!isRecord(state)) {
    return null;
  }

  if (state.type === "docker") {
    const volumeName = state.volumeName;
    if (hasNonEmptyString(volumeName)) {
      return volumeName;
    }

    const containerName = state.containerName;
    return hasNonEmptyString(containerName) ? containerName : null;
  }

  const sandboxName = (state as { sandboxName?: unknown }).sandboxName;
  return hasNonEmptyString(sandboxName) ? sandboxName : null;
}

export function getResumableSandboxName(state: unknown): string | null {
  return getPersistentSandboxName(state) ?? getLegacySandboxId(state);
}

export function hasResumableSandboxState(state: unknown): boolean {
  return getResumableSandboxName(state) !== null;
}

export function hasPausedSandboxState(state: unknown): boolean {
  return hasResumableSandboxState(state) && !hasRuntimeSandboxState(state);
}

/**
 * Type guard to check if a sandbox is active and ready to accept operations.
 */
export function isSandboxActive(
  state: SandboxState | null | undefined,
): state is SandboxState {
  if (!state) return false;

  if (state.type === "docker") {
    return hasRuntimeState(state);
  }

  const expiresAt = getSandboxExpiresAt(state);
  if (expiresAt === undefined) {
    return false;
  }

  if (Date.now() >= expiresAt - SANDBOX_EXPIRES_BUFFER_MS) {
    return false;
  }

  return hasRuntimeState(state);
}

/**
 * Check if we can perform operations on a live sandbox session (stop, extend, etc.).
 */
export function canOperateOnSandbox(
  state: SandboxState | null | undefined,
): state is SandboxState {
  if (!state) return false;
  return hasRuntimeState(state);
}

/**
 * Check if an unknown value represents sandbox state with live runtime data.
 */
export function hasRuntimeSandboxState(state: unknown): boolean {
  if (!isRecord(state) || !("type" in state)) return false;

  if (state.type === "docker") {
    const hostPortMap = state.hostPortMap;
    return (
      isRecord(hostPortMap) &&
      Object.keys(hostPortMap).length > 0 &&
      hasResumableSandboxState(state)
    );
  }

  const expiresAt = getSandboxExpiresAt(state);
  if (expiresAt === undefined) {
    return false;
  }

  return hasResumableSandboxState(state);
}

export function isSandboxNotFoundError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("status code 404") ||
    normalized.includes("sandbox not found")
  );
}

/**
 * Check if an error message indicates the sandbox VM is permanently unavailable.
 */
export function isSandboxUnavailableError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("expected a stream of command data") ||
    normalized.includes("status code 410") ||
    normalized.includes("status code 404") ||
    normalized.includes("sandbox is stopped") ||
    normalized.includes("sandbox not found") ||
    normalized.includes("sandbox probe failed")
  );
}

function hasRuntimeState(state: SandboxState): boolean {
  if (state.type === "docker") {
    return hasRuntimeSandboxState(state);
  }

  const expiresAt = getSandboxExpiresAt(state);
  if (expiresAt === undefined) {
    return false;
  }
  return hasResumableSandboxState(state);
}

/**
 * Clear sandbox runtime state while preserving durable resume state when available.
 */
export function clearSandboxState(
  state: SandboxState | null | undefined,
): SandboxState | null {
  if (!state) return null;

  if (state.type === "docker") {
    return {
      type: "docker",
      containerName: state.containerName,
      volumeName: state.volumeName,
      ports: state.ports,
      hostPortMap: {},
    };
  }

  const sandboxName = getPersistentSandboxName(state);
  const sandboxId = sandboxName ? null : getLegacySandboxId(state);

  return {
    type: state.type,
    ...(sandboxName ? { sandboxName } : {}),
    ...(sandboxId ? { sandboxId } : {}),
  } as SandboxState;
}

/**
 * Clear both runtime state and any saved resume handle.
 */
export function clearSandboxResumeState(
  state: SandboxState | null | undefined,
): SandboxState | null {
  if (!state) return null;

  if (state.type === "docker") {
    return null;
  }

  return { type: "vercel" };
}

/**
 * Clear sandbox state after an unavailable-sandbox error.
 * Hard 404s wipe the saved resume handle; other unavailable errors preserve it.
 */
export function clearUnavailableSandboxState(
  state: SandboxState | null | undefined,
  message: string,
): SandboxState | null {
  if (state?.type === "docker") {
    return clearSandboxState(state);
  }
  return isSandboxNotFoundError(message)
    ? clearSandboxResumeState(state)
    : clearSandboxState(state);
}
