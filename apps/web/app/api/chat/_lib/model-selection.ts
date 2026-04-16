import type { AgentModelSelection } from "@open-harness/agent";
import { resolveAvailableModelId } from "@/lib/model-availability";
import { type ModelVariant, resolveModelSelection } from "@/lib/model-variants";
import { getDefaultModelId } from "@/lib/models";

interface ResolveChatModelSelectionParams {
  selectedModelId: string | null | undefined;
  modelVariants: ModelVariant[];
  missingVariantLabel: string;
}

export function resolveChatModelSelection({
  selectedModelId,
  modelVariants,
  missingVariantLabel,
}: ResolveChatModelSelectionParams): AgentModelSelection {
  const defaultModelId = getDefaultModelId();
  const requestedModelId = selectedModelId ?? defaultModelId;
  const selection = resolveModelSelection(requestedModelId, modelVariants);

  if (selection.isMissingVariant) {
    console.warn(
      `${missingVariantLabel} "${requestedModelId}" was not found. Falling back to default model.`,
    );
    return { id: defaultModelId as AgentModelSelection["id"] };
  }

  const availableModelId = resolveAvailableModelId(selection.resolvedModelId);
  if (availableModelId !== selection.resolvedModelId) {
    console.warn(
      `${missingVariantLabel} "${requestedModelId}" resolves to disabled model "${selection.resolvedModelId}". Falling back to default model.`,
    );
    return { id: defaultModelId as AgentModelSelection["id"] };
  }

  return {
    id: availableModelId as AgentModelSelection["id"],
    ...(selection.providerOptionsByProvider
      ? {
          providerOptionsOverrides: selection.providerOptionsByProvider,
        }
      : {}),
  };
}
