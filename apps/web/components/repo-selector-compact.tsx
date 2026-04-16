"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface RepoSelectorCompactProps {
  selectedOwner: string;
  selectedRepo: string;
  onSelect: (owner: string, repo: string) => void;
}

export function RepoSelectorCompact({
  selectedOwner,
  selectedRepo,
  onSelect,
}: RepoSelectorCompactProps) {
  const [owner, setOwner] = useState(selectedOwner);
  const [repo, setRepo] = useState(selectedRepo);

  useEffect(() => {
    setOwner(selectedOwner);
  }, [selectedOwner]);

  useEffect(() => {
    setRepo(selectedRepo);
  }, [selectedRepo]);

  const emitSelection = (nextOwner: string, nextRepo: string) => {
    onSelect(nextOwner.trim(), nextRepo.trim());
  };

  return (
    <div className="grid gap-3">
      <div className="grid gap-2">
        <Label htmlFor="repo-owner-input">Repository owner</Label>
        <Input
          id="repo-owner-input"
          value={owner}
          placeholder="vercel"
          onChange={(event) => {
            const nextOwner = event.target.value;
            setOwner(nextOwner);
            emitSelection(nextOwner, repo);
          }}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="repo-name-input">Repository name</Label>
        <Input
          id="repo-name-input"
          value={repo}
          placeholder="open-agents"
          onChange={(event) => {
            const nextRepo = event.target.value;
            setRepo(nextRepo);
            emitSelection(owner, nextRepo);
          }}
        />
      </div>
    </div>
  );
}
