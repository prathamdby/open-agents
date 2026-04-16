"use client";

import useSWR from "swr";
import type { Session } from "@/lib/session/types";
import { fetcher } from "@/lib/swr";

export function useSession() {
  const { data, isLoading } = useSWR<Session>("/api/auth/info", fetcher, {
    revalidateOnFocus: true,
  });

  return {
    session: data,
    loading: isLoading,
    isAuthenticated: Boolean(data?.user),
    hasGitHub: Boolean(data?.user),
    hasGitHubAccount: Boolean(data?.user),
    hasGitHubInstallations: Boolean(data?.user),
  };
}
