import { buildBody, getModel, resolveEndpoint, type ModelDef } from "./models";

/**
 * Shared parsing for /api/generate and /api/estimate — both take the same shape
 * from the prompt bar, and the estimate must be built from an identical body or
 * the quoted price won't match what gets charged.
 */

export interface GenerationRequest {
  model: ModelDef;
  endpoint: string;
  body: Record<string, unknown>;
  prompt: string;
  batch: number;
  refUrls: string[];
}

export class BadRequest extends Error {}

export function parseGenerationRequest(input: unknown): GenerationRequest {
  const raw = (input ?? {}) as Record<string, unknown>;

  const model = getModel(String(raw.modelId ?? ""));
  if (!model) throw new BadRequest(`Unknown model: ${String(raw.modelId)}`);

  const prompt = String(raw.prompt ?? "").trim();
  if (!prompt) throw new BadRequest("A prompt is required.");

  const refUrls = Array.isArray(raw.refUrls) ? raw.refUrls.map(String).filter(Boolean) : [];
  if (model.refRequired && refUrls.length === 0) {
    throw new BadRequest(`${model.name} needs a reference image.`);
  }

  const batchRaw = Number(raw.batch ?? 1);
  const batch = Number.isFinite(batchRaw) ? Math.max(1, Math.round(batchRaw)) : 1;

  const params = (raw.params ?? {}) as Record<string, unknown>;
  const endpoint = resolveEndpoint(model, refUrls.length > 0);
  const body = buildBody(model, prompt, params, batch, refUrls);

  return { model, endpoint, body, prompt, batch, refUrls };
}
