import { api } from './client'

/** A model (checkpoint or LoRA) as described by SwarmUI's ListModels route. */
export type SwarmModel = {
  name: string
  title: string | null
  author: string | null
  description: string | null
  preview_image: string | null
  architecture: string | null
  class: string | null
  standard_width: number
  standard_height: number
  loaded: boolean
  lora_default_weight?: string | null
  trigger_phrase?: string | null
}

type ListModelsResponse = { folders: string[]; files: SwarmModel[] }

/** Lists every model of a kind, searching all subfolders. */
async function listModels(subtype: 'Stable-Diffusion' | 'LoRA'): Promise<SwarmModel[]> {
  const data = await api<ListModelsResponse>('ListModels', { path: '', depth: 10, subtype, sortBy: 'Name', allowRemote: true })
  return data.files || []
}

/** Lists the main image models. */
export function listCheckpoints(): Promise<SwarmModel[]> {
  return listModels('Stable-Diffusion')
}

/** Lists LoRAs. */
export function listLoras(): Promise<SwarmModel[]> {
  return listModels('LoRA')
}

/** The model's name the way SwarmUI writes it in parameters: no file extension. */
export function cleanModelName(name: string): string {
  return name.replace(/\.(safetensors|sft|ckpt|gguf|engine)$/i, '')
}

/** A short display name: the model's title if it has one, otherwise its file name without the folder. */
export function modelLabel(model: SwarmModel): string {
  if (model.title && model.title.trim()) {
    return model.title
  }
  return cleanModelName(model.name).split('/').pop() || model.name
}

/** The folder part of a model's name, or an empty string for the root. */
export function modelFolder(model: SwarmModel): string {
  const idx = model.name.lastIndexOf('/')
  return idx < 0 ? '' : model.name.slice(0, idx)
}
