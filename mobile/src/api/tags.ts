import { api } from './client'

/** Which kind of model tags belong to, as SwarmUI names them. */
export type TagSubtype = 'Stable-Diffusion' | 'LoRA'

/** Negative tags per model name, for each kind of model. */
export type NegativeTags = Record<TagSubtype, Record<string, string>>

/** Lists the negative tags remembered for models and LoRAs. Positive tags come with the model list, as each model's trigger phrase. */
export async function listNegativeTags(): Promise<NegativeTags> {
  const data = await api<{ negatives?: Partial<NegativeTags> }>('ModelTagsList')
  return { 'Stable-Diffusion': data.negatives?.['Stable-Diffusion'] || {}, LoRA: data.negatives?.LoRA || {} }
}

/** Saves a model's tags on the server. Resolves to the tags as the server stored them, after tidying. */
export async function setModelTags(subtype: TagSubtype, model: string, positive: string, negative: string): Promise<{ positive: string; negative: string }> {
  return api<{ positive: string; negative: string }>('ModelTagsSet', { model, subtype, positive, negative })
}
