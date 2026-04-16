"use client";

import { GitBranch, Plus } from "lucide-react";
import { useState } from "react";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import { BranchSelectorCompact } from "./branch-selector-compact";
import { RepoSelectorCompact } from "./repo-selector-compact";
import {
  DEFAULT_SANDBOX_TYPE,
  type SandboxType,
} from "./sandbox-selector-compact";
import { Switch } from "./ui/switch";

type SessionMode = "empty" | "repo";

interface SessionStarterProps {
  onSubmit: (session: {
    repoOwner?: string;
    repoName?: string;
    branch?: string;
    cloneUrl?: string;
    isNewBranch: boolean;
    sandboxType: SandboxType;
    autoCommitPush: boolean;
    autoCreatePr: boolean;
    vercelProject?: null;
  }) => void;
  isLoading?: boolean;
  lastRepo: { owner: string; repo: string } | null;
}

export function SessionStarter({
  onSubmit,
  isLoading,
  lastRepo,
}: SessionStarterProps) {
  const [mode, setMode] = useState<SessionMode>(lastRepo ? "repo" : "empty");
  const [selectedOwner, setSelectedOwner] = useState(lastRepo?.owner ?? "");
  const [selectedRepo, setSelectedRepo] = useState(lastRepo?.repo ?? "");
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [isNewBranch, setIsNewBranch] = useState(Boolean(lastRepo));
  const { preferences, loading } = useUserPreferences();

  const autoCommitPush = preferences?.autoCommitPush ?? false;
  const autoCreatePr = preferences?.autoCreatePr ?? false;
  const sandboxType = preferences?.defaultSandboxType ?? DEFAULT_SANDBOX_TYPE;

  const canSubmit =
    !loading &&
    !isLoading &&
    (mode === "empty" || (selectedOwner.trim() && selectedRepo.trim()));

  return (
    <div className="w-full max-w-2xl rounded-xl border border-border/70 bg-card/80 p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-4">
        <div className="flex rounded-lg bg-muted/70 p-1">
          <button
            type="button"
            onClick={() => setMode("empty")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${
              mode === "empty"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Plus className="h-3.5 w-3.5" />
            Empty sandbox
          </button>
          <button
            type="button"
            onClick={() => setMode("repo")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${
              mode === "repo"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <GitBranch className="h-3.5 w-3.5" />
            From repository
          </button>
        </div>

        {mode === "repo" ? (
          <div className="flex flex-col gap-3">
            <RepoSelectorCompact
              selectedOwner={selectedOwner}
              selectedRepo={selectedRepo}
              onSelect={(owner, repo) => {
                setSelectedOwner(owner);
                setSelectedRepo(repo);
                setSelectedBranch(null);
              }}
            />
            {selectedOwner && selectedRepo ? (
              <BranchSelectorCompact
                owner={selectedOwner}
                repo={selectedRepo}
                value={selectedBranch}
                isNewBranch={isNewBranch}
                onChange={(branch, nextIsNewBranch) => {
                  setSelectedBranch(branch);
                  setIsNewBranch(nextIsNewBranch);
                }}
              />
            ) : null}
          </div>
        ) : (
          <p className="text-center text-sm text-muted-foreground">
            Start with a blank sandbox.
          </p>
        )}

        <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">Auto commit and push</span>
            <Switch checked={autoCommitPush} disabled />
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-sm">Auto create PR</span>
            <Switch checked={autoCreatePr && autoCommitPush} disabled />
          </div>
        </div>

        <button
          type="button"
          onClick={() =>
            onSubmit({
              repoOwner:
                mode === "repo" ? selectedOwner || undefined : undefined,
              repoName: mode === "repo" ? selectedRepo || undefined : undefined,
              branch: mode === "repo" ? selectedBranch || undefined : undefined,
              cloneUrl:
                mode === "repo" && selectedOwner && selectedRepo
                  ? `https://github.com/${selectedOwner}/${selectedRepo}`
                  : undefined,
              isNewBranch: mode === "repo" ? isNewBranch : false,
              sandboxType,
              autoCommitPush,
              autoCreatePr: autoCommitPush ? autoCreatePr : false,
              vercelProject: null,
            })
          }
          disabled={!canSubmit}
          className="w-full rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? "Creating..." : "Start session"}
        </button>
      </div>
    </div>
  );
}
