import "server-only";
import { getGitHubPat } from "@/lib/github/pat";

export async function getUserGitHubToken(_userId?: string): Promise<string> {
  return getGitHubPat();
}
