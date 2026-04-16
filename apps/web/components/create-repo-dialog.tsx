"use client";

import { Check, ExternalLink, FolderGit2, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { Session } from "@/lib/db/schema";

interface CreateRepoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: Session;
  hasSandbox: boolean;
  onRepoCreated?: (result: {
    repoUrl: string;
    owner: string;
    repoName: string;
    cloneUrl: string;
    branch: string;
  }) => void;
}

interface CreateRepoResult {
  repoUrl: string;
  owner: string;
  repoName: string;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/--+/g, "-")
    .trim()
    .slice(0, 50);
}

export function CreateRepoDialog({
  open,
  onOpenChange,
  session,
  hasSandbox,
  onRepoCreated,
}: CreateRepoDialogProps) {
  const [repoName, setRepoName] = useState("");
  const [description, setDescription] = useState("");
  const [owner, setOwner] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [result, setResult] = useState<CreateRepoResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setRepoName(slugify(session.title));
    setDescription("");
    setOwner(session.repoOwner ?? "");
    setIsPrivate(false);
    setResult(null);
    setError(null);
  }, [open, session.title, session.repoOwner]);

  const handleCreate = async () => {
    if (!repoName.trim()) {
      setError("Repository name is required");
      return;
    }
    if (!hasSandbox) {
      setError("Sandbox not active. Start the sandbox before creating a repo.");
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const res = await fetch("/api/github/create-repo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          repoName: repoName.trim(),
          description: description.trim() || undefined,
          isPrivate,
          sessionTitle: session.title,
          owner: owner.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create repository");
      }

      const createResult = {
        repoUrl: data.repoUrl as string,
        owner: data.owner as string,
        repoName: data.repoName as string,
        cloneUrl: data.cloneUrl as string,
        branch: data.branch as string,
      };
      setResult(createResult);
      onRepoCreated?.(createResult);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Failed to create repository",
      );
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderGit2 className="h-5 w-5" />
            Create Repository
          </DialogTitle>
          <DialogDescription>
            Create a GitHub repository from your current sandbox work.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="flex flex-col items-center gap-4 py-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
              <Check className="h-6 w-6 text-green-500" />
            </div>
            <div className="text-center">
              <p className="font-medium">Repository created successfully</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {result.owner}/{result.repoName}
              </p>
              <a
                href={result.repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-sm text-blue-500 hover:underline"
              >
                View on GitHub
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        ) : (
          <>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="repo-owner">Owner (optional)</Label>
                <Input
                  id="repo-owner"
                  placeholder="Defaults to your GitHub username"
                  value={owner}
                  onChange={(event) => setOwner(event.target.value)}
                  disabled={isCreating}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="repo-name">Repository name</Label>
                <Input
                  id="repo-name"
                  value={repoName}
                  onChange={(event) => setRepoName(event.target.value)}
                  disabled={isCreating}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="repo-description">Description (optional)</Label>
                <Textarea
                  id="repo-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={3}
                  disabled={isCreating}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Private repository</p>
                  <p className="text-xs text-muted-foreground">
                    Keep this repository visible only to you and collaborators.
                  </p>
                </div>
                <Switch
                  checked={isPrivate}
                  onCheckedChange={setIsPrivate}
                  disabled={isCreating}
                />
              </div>
              {error ? (
                <p className="text-sm text-destructive">{error}</p>
              ) : null}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isCreating}
              >
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={isCreating}>
                {isCreating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create repository"
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
