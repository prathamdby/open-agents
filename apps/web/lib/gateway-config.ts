import "server-only";
import type { GatewayConfig } from "@open-harness/agent";

export function getGatewayConfig(): GatewayConfig {
  const baseURL = process.env.AI_GATEWAY_BASE_URL;
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!baseURL || !apiKey) {
    throw new Error("AI_GATEWAY_BASE_URL and AI_GATEWAY_API_KEY must be set.");
  }
  return { baseURL, apiKey };
}
