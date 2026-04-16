import { cache } from "react";
import { getGitHubUser } from "@/lib/github/pat";

export const getServerSession = cache(async () => {
  return { user: await getGitHubUser() };
});
