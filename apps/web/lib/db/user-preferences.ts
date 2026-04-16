import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { SandboxType } from "@/components/sandbox-selector-compact";
import { modelVariantsSchema, type ModelVariant } from "@/lib/model-variants";
import { getDefaultModelId } from "@/lib/models";
import {
  normalizeGlobalSkillRefs,
  type GlobalSkillRef,
} from "@/lib/skills/global-skill-refs";
import { db } from "./client";
import { userPreferences, type UserPreferences } from "./schema";

export type DiffMode = "unified" | "split";

export interface UserPreferencesData {
  defaultModelId: string;
  defaultSubagentModelId: string | null;
  defaultSandboxType: SandboxType;
  defaultDiffMode: DiffMode;
  autoCommitPush: boolean;
  autoCreatePr: boolean;
  alertsEnabled: boolean;
  alertSoundEnabled: boolean;
  publicUsageEnabled: boolean;
  globalSkillRefs: GlobalSkillRef[];
  modelVariants: ModelVariant[];
  enabledModelIds: string[];
}

function getDefaultPreferences(): UserPreferencesData {
  return {
    defaultModelId: getDefaultModelId(),
    defaultSubagentModelId: null,
    defaultSandboxType: "vercel",
    defaultDiffMode: "unified",
    autoCommitPush: false,
    autoCreatePr: false,
    alertsEnabled: true,
    alertSoundEnabled: true,
    publicUsageEnabled: false,
    globalSkillRefs: [],
    modelVariants: [],
    enabledModelIds: [],
  };
}

const VALID_SANDBOX_TYPES: SandboxType[] = ["vercel"];
const VALID_DIFF_MODES: DiffMode[] = ["unified", "split"];

function normalizeSandboxType(value: unknown): SandboxType {
  const defaultPreferences = getDefaultPreferences();
  if (value === "hybrid") {
    return "vercel";
  }

  if (
    typeof value === "string" &&
    VALID_SANDBOX_TYPES.includes(value as SandboxType)
  ) {
    return value as SandboxType;
  }

  return defaultPreferences.defaultSandboxType;
}

function normalizeDiffMode(value: unknown): DiffMode {
  const defaultPreferences = getDefaultPreferences();
  if (
    typeof value === "string" &&
    VALID_DIFF_MODES.includes(value as DiffMode)
  ) {
    return value as DiffMode;
  }

  return defaultPreferences.defaultDiffMode;
}

function normalizeEnabledModelIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

export function toUserPreferencesData(
  row?: Pick<
    UserPreferences,
    | "defaultModelId"
    | "defaultSubagentModelId"
    | "defaultSandboxType"
    | "defaultDiffMode"
    | "autoCommitPush"
    | "autoCreatePr"
    | "alertsEnabled"
    | "alertSoundEnabled"
    | "publicUsageEnabled"
    | "globalSkillRefs"
    | "modelVariants"
    | "enabledModelIds"
  >,
): UserPreferencesData {
  const defaultPreferences = getDefaultPreferences();
  const parsedModelVariants = modelVariantsSchema.safeParse(
    row?.modelVariants ?? [],
  );

  return {
    defaultModelId: row?.defaultModelId ?? defaultPreferences.defaultModelId,
    defaultSubagentModelId: row?.defaultSubagentModelId ?? null,
    defaultSandboxType: normalizeSandboxType(row?.defaultSandboxType),
    defaultDiffMode: normalizeDiffMode(row?.defaultDiffMode),
    autoCommitPush: row?.autoCommitPush ?? defaultPreferences.autoCommitPush,
    autoCreatePr: row?.autoCreatePr ?? defaultPreferences.autoCreatePr,
    alertsEnabled: row?.alertsEnabled ?? defaultPreferences.alertsEnabled,
    alertSoundEnabled:
      row?.alertSoundEnabled ?? defaultPreferences.alertSoundEnabled,
    publicUsageEnabled:
      row?.publicUsageEnabled ?? defaultPreferences.publicUsageEnabled,
    globalSkillRefs: normalizeGlobalSkillRefs(row?.globalSkillRefs),
    modelVariants: parsedModelVariants.success ? parsedModelVariants.data : [],
    enabledModelIds: normalizeEnabledModelIds(row?.enabledModelIds),
  };
}

/**
 * Get user preferences, creating default preferences if none exist
 */
export async function getUserPreferences(
  userId: string,
): Promise<UserPreferencesData> {
  const [existing] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);

  return toUserPreferencesData(existing);
}

/**
 * Update user preferences, creating if they don't exist
 */
export async function updateUserPreferences(
  userId: string,
  updates: Partial<UserPreferencesData>,
): Promise<UserPreferencesData> {
  const defaultPreferences = getDefaultPreferences();
  const [existing] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(userPreferences)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(userPreferences.userId, userId))
      .returning();

    return toUserPreferencesData(updated);
  }

  // Create new preferences
  const [created] = await db
    .insert(userPreferences)
    .values({
      id: nanoid(),
      userId,
      defaultModelId:
        updates.defaultModelId ?? defaultPreferences.defaultModelId,
      defaultSubagentModelId: updates.defaultSubagentModelId ?? null,
      defaultSandboxType:
        updates.defaultSandboxType ?? defaultPreferences.defaultSandboxType,
      defaultDiffMode:
        updates.defaultDiffMode ?? defaultPreferences.defaultDiffMode,
      autoCommitPush:
        updates.autoCommitPush ?? defaultPreferences.autoCommitPush,
      autoCreatePr: updates.autoCreatePr ?? defaultPreferences.autoCreatePr,
      alertsEnabled: updates.alertsEnabled ?? defaultPreferences.alertsEnabled,
      alertSoundEnabled:
        updates.alertSoundEnabled ?? defaultPreferences.alertSoundEnabled,
      publicUsageEnabled:
        updates.publicUsageEnabled ?? defaultPreferences.publicUsageEnabled,
      globalSkillRefs:
        updates.globalSkillRefs ?? defaultPreferences.globalSkillRefs,
      modelVariants: updates.modelVariants ?? defaultPreferences.modelVariants,
      enabledModelIds:
        updates.enabledModelIds ?? defaultPreferences.enabledModelIds,
    })
    .returning();

  return toUserPreferencesData(created);
}
