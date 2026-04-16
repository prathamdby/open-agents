import { createServer } from "node:net";
import {
  DOCKER_HOST_PORT_RANGE_END,
  DOCKER_HOST_PORT_RANGE_START,
} from "./config";

const allocatedPorts = new Set<number>();

function canBindPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => {
      resolve(false);
    });
    server.listen(port, "127.0.0.1", () => {
      server.close(() => {
        resolve(true);
      });
    });
  });
}

export async function allocatePort(): Promise<number> {
  for (
    let port = DOCKER_HOST_PORT_RANGE_START;
    port < DOCKER_HOST_PORT_RANGE_END;
    port += 1
  ) {
    if (allocatedPorts.has(port)) {
      continue;
    }

    if (!(await canBindPort(port))) {
      continue;
    }

    allocatedPorts.add(port);
    return port;
  }

  throw new Error(
    "No free Docker host ports available in the configured range.",
  );
}

export function reservePort(port: number): void {
  allocatedPorts.add(port);
}

export function releasePort(port: number): void {
  allocatedPorts.delete(port);
}
