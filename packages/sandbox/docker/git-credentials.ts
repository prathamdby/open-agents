function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

interface GitUser {
  name: string;
  email: string;
}

export function buildGitCredentialSetupScript(options: {
  githubToken?: string;
  gitUser?: GitUser;
}): string | null {
  const commands: string[] = [];

  if (options.githubToken) {
    commands.push("git config --global credential.helper store");
    commands.push(
      `echo ${shellQuote(`https://x-access-token:${options.githubToken}@github.com`)} > ~/.git-credentials`,
    );
    commands.push("chmod 600 ~/.git-credentials");
  }

  if (options.gitUser) {
    commands.push(
      `git config --global user.name ${shellQuote(options.gitUser.name)}`,
    );
    commands.push(
      `git config --global user.email ${shellQuote(options.gitUser.email)}`,
    );
  }

  if (commands.length === 0) {
    return null;
  }

  return commands.join(" && ");
}

export { shellQuote };
