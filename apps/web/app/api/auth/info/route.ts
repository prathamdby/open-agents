import { getGitHubUser } from "@/lib/github/pat";

export async function GET() {
  const user = await getGitHubUser();
  return Response.json({ user });
}
