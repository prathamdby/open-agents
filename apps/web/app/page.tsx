import { redirect } from "next/navigation";
import { getGitHubPat } from "@/lib/github/pat";

export default function Home() {
  const hasPat = Boolean(process.env.GITHUB_PAT);
  if (hasPat) {
    getGitHubPat();
    redirect("/sessions");
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6 text-sm text-muted-foreground">
      Set GITHUB_PAT in apps/web/.env and restart the app.
    </main>
  );
}
