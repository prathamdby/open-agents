import "server-only";
import { Octokit } from "@octokit/rest";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";

export interface GitHubUser {
  id: string;
  username: string;
  email: string | undefined;
  name: string | undefined;
  avatarUrl: string;
  avatar: string;
}

let cachedGitHubUserPromise: Promise<GitHubUser> | null = null;

export function getGitHubPat(): string {
  const pat = process.env.GITHUB_PAT;
  if (!pat) {
    throw new Error("GITHUB_PAT must be set.");
  }
  return pat;
}

async function fetchGitHubUser(): Promise<GitHubUser> {
  const pat = getGitHubPat();
  const octokit = new Octokit({ auth: pat });
  const response = await octokit.rest.users.getAuthenticated();
  const user = response.data;

  const mappedUser: GitHubUser = {
    id: String(user.id),
    username: user.login,
    email: user.email ?? undefined,
    name: user.name ?? undefined,
    avatarUrl: user.avatar_url,
    avatar: user.avatar_url,
  };

  await db
    .insert(users)
    .values({
      id: mappedUser.id,
      provider: "github",
      externalId: mappedUser.id,
      accessToken: pat,
      username: mappedUser.username,
      email: mappedUser.email,
      name: mappedUser.name,
      avatarUrl: mappedUser.avatarUrl,
      updatedAt: new Date(),
      lastLoginAt: new Date(),
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        provider: "github",
        externalId: mappedUser.id,
        accessToken: pat,
        username: mappedUser.username,
        email: mappedUser.email,
        name: mappedUser.name,
        avatarUrl: mappedUser.avatarUrl,
        updatedAt: new Date(),
        lastLoginAt: new Date(),
      },
    });

  return mappedUser;
}

export function getGitHubUser(): Promise<GitHubUser> {
  if (!cachedGitHubUserPromise) {
    cachedGitHubUserPromise = fetchGitHubUser();
  }
  return cachedGitHubUserPromise;
}
