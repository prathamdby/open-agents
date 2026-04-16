"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function RepoSelector({
  onRepoSelect,
}: {
  onRepoSelect: (owner: string, repo: string) => void;
}) {
  const [owner, setOwner] = useState("");
  const [repo, setRepo] = useState("");

  const canSubmit = owner.trim().length > 0 && repo.trim().length > 0;

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="repo-owner">Repository owner</Label>
        <Input
          id="repo-owner"
          value={owner}
          placeholder="vercel"
          onChange={(event) => setOwner(event.target.value)}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="repo-name">Repository name</Label>
        <Input
          id="repo-name"
          value={repo}
          placeholder="open-agents"
          onChange={(event) => setRepo(event.target.value)}
        />
      </div>
      <Button
        type="button"
        disabled={!canSubmit}
        onClick={() => onRepoSelect(owner.trim(), repo.trim())}
      >
        Use repository
      </Button>
    </div>
  );
}
