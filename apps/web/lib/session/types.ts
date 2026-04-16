import type { GitHubUser } from "@/lib/github/pat";

export interface Session {
  user: GitHubUser;
}
