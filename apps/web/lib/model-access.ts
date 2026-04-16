import type { UserPreferencesData } from "@/lib/db/user-preferences";
import { getDefaultModelId } from "@/lib/models";
import {
  getAllVariants,
  MODEL_VARIANT_ID_PREFIX,
  type ModelVariant,
} from "@/lib/model-variants";
import type { Session } from "@/lib/session/types";

type SessionLike = Session | null | undefined;

export const MANAGED_TEMPLATE_TRIAL_MODEL_ACCESS_ERROR =
  "Selected model is not available for this session.";

export function isRestrictedModelIdForSession(
  _modelId: string,
  _session: SessionLike,
  _url: string | URL,
): boolean {
  return false;
}

export function filterModelsForSession<T extends { id: string }>(
  models: T[],
  _session: SessionLike,
  _url: string | URL,
): T[] {
  return models;
}

export function filterModelVariantsForSession(
  modelVariants: ModelVariant[],
  _session: SessionLike,
  _url: string | URL,
): ModelVariant[] {
  return modelVariants;
}

export function sanitizeSelectedModelIdForSession(
  modelId: string | null | undefined,
  modelVariants: ModelVariant[],
  _session: SessionLike,
  _url: string | URL,
): string | null | undefined {
  if (!modelId) {
    return modelId;
  }

  if (
    modelId.startsWith(MODEL_VARIANT_ID_PREFIX) &&
    !modelVariants.some((variant) => variant.id === modelId)
  ) {
    return getDefaultModelId();
  }

  return modelId;
}

export function sanitizeUserPreferencesForSession(
  preferences: UserPreferencesData,
  _session: SessionLike,
  _url: string | URL,
): UserPreferencesData {
  const availableModelVariants = getAllVariants(preferences.modelVariants);
  const defaultModelId = getDefaultModelId();

  return {
    ...preferences,
    defaultModelId:
      sanitizeSelectedModelIdForSession(
        preferences.defaultModelId,
        availableModelVariants,
        null,
        "",
      ) ?? defaultModelId,
    defaultSubagentModelId:
      sanitizeSelectedModelIdForSession(
        preferences.defaultSubagentModelId,
        availableModelVariants,
        null,
        "",
      ) ?? null,
    modelVariants: preferences.modelVariants,
    enabledModelIds: preferences.enabledModelIds,
  };
}
