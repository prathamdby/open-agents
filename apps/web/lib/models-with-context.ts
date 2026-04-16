import "server-only";
import { z } from "zod";
import { getGatewayConfig } from "./gateway-config";
import { filterDisabledModels } from "./model-availability";
import type { AvailableModel } from "./models";

const modelRecordSchema = z
  .object({
    id: z.string(),
    name: z.string().optional(),
    modelType: z.string().optional(),
    type: z.string().optional(),
    context_window: z.number().positive().optional(),
  })
  .passthrough();

const modelsResponseSchema = z
  .object({
    data: z.array(modelRecordSchema).optional(),
    models: z.array(modelRecordSchema).optional(),
  })
  .passthrough();

const configuredModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  context_window: z.number().positive().optional(),
});

const configuredModelsSchema = z.array(configuredModelSchema);

function mapConfiguredModelToAvailableModel(
  model: z.infer<typeof configuredModelSchema>,
): AvailableModel {
  return {
    id: model.id,
    name: model.name,
    modelType: "language",
    context_window: model.context_window,
  };
}

function mapApiModelToAvailableModel(
  model: z.infer<typeof modelRecordSchema>,
): AvailableModel {
  return {
    id: model.id,
    name: model.name ?? model.id,
    modelType: model.modelType ?? model.type ?? "language",
    context_window: model.context_window,
  };
}

function getConfiguredModels(): AvailableModel[] | null {
  const rawModels = process.env.AI_MODELS_JSON;
  if (!rawModels) {
    return null;
  }

  const parsedModels = configuredModelsSchema.parse(
    JSON.parse(rawModels) as unknown,
  );
  return parsedModels.map(mapConfiguredModelToAvailableModel);
}

async function fetchGatewayModels(): Promise<AvailableModel[]> {
  const gatewayConfig = getGatewayConfig();
  const response = await fetch(`${gatewayConfig.baseURL}/models`, {
    headers: {
      Authorization: `Bearer ${gatewayConfig.apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch models from the configured gateway.");
  }

  const payload = modelsResponseSchema.parse(
    (await response.json()) as unknown,
  );
  const models = payload.data ?? payload.models ?? [];

  return models.map(mapApiModelToAvailableModel);
}

export async function fetchAvailableLanguageModels(): Promise<
  AvailableModel[]
> {
  const configuredModels = getConfiguredModels();
  if (configuredModels) {
    return filterDisabledModels(configuredModels);
  }

  const models = await fetchGatewayModels();
  return filterDisabledModels(
    models.filter((model) => (model.modelType ?? "language") === "language"),
  );
}

export async function fetchAvailableLanguageModelsWithContext(): Promise<
  AvailableModel[]
> {
  return fetchAvailableLanguageModels();
}
