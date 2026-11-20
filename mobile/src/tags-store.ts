import { create } from 'zustand'
import { modelLabel, type SwarmModel } from '@/api/models'
import { listNegativeTags, setModelTags, type NegativeTags, type TagSubtype } from '@/api/tags'
import { useModels } from '@/models-store'

/** The tags one model or LoRA adds to prompts. */
export type TagGroup = {
  /** Identifies the group in the list of switched-off groups. */
  key: string
  subtype: TagSubtype
  /** Full model name as SwarmUI lists it. */
  name: string
  /** Short name to show. */
  label: string
  positive: string
  negative: string
  /** False when the user switched this group off for now. */
  on: boolean
}

type TagsState = {
  negatives: NegativeTags
  /** False when the server has no ModelTags extension: tags can then be read (trigger phrases) but not edited. */
  supported: boolean
  /** Fetches the remembered negative tags. */
  load: () => Promise<void>
  /** Saves a model's tags on the server and updates the lists held in the app. Throws with the server's message if refused. */
  save: (subtype: TagSubtype, name: string, positive: string, negative: string) => Promise<void>
}

export const useTags = create<TagsState>()((set, get) => ({
  negatives: { 'Stable-Diffusion': {}, LoRA: {} },
  supported: true,

  load: async () => {
    try {
      set({ negatives: await listNegativeTags(), supported: true })
    }
    catch {
      set({ supported: false })
    }
  },

  save: async (subtype, name, positive, negative) => {
    const saved = await setModelTags(subtype, name, positive, negative)
    const forKind = { ...get().negatives[subtype] }
    if (saved.negative) {
      forKind[name] = saved.negative
    }
    else {
      delete forKind[name]
    }
    set({ negatives: { ...get().negatives, [subtype]: forKind } })
    // The positive tags live in the model list as the model's trigger phrase, so update that copy too.
    const models = useModels.getState()
    const patch = (list: SwarmModel[]) => list.map((m) => (m.name == name ? { ...m, trigger_phrase: saved.positive } : m))
    useModels.setState(subtype == 'LoRA' ? { loras: patch(models.loras) } : { checkpoints: patch(models.checkpoints) })
  },
}))

/** The key a model's tag group is known by in the switched-off list. */
export function tagGroupKey(subtype: TagSubtype, name: string): string {
  return `${subtype}:${name}`
}

/**
 * The tag groups for a choice of model and LoRAs: the model first, then each LoRA in the order it was added.
 * Every chosen model gets a group, even with no tags yet, so the editor can list it.
 */
export function tagGroupsFor(model: string | null, loras: { name: string }[], tagsOff: string[]): TagGroup[] {
  const models = useModels.getState()
  const negatives = useTags.getState().negatives
  const groups: TagGroup[] = []
  const add = (subtype: TagSubtype, name: string, list: SwarmModel[]) => {
    const found = list.find((m) => m.name == name)
    if (!found) {
      return
    }
    const key = tagGroupKey(subtype, name)
    groups.push({
      key,
      subtype,
      name,
      label: modelLabel(found),
      // SwarmUI treats semicolons in a trigger phrase as commas.
      positive: (found.trigger_phrase || '').replace(/;/g, ',').trim(),
      negative: negatives[subtype][name] || '',
      on: !tagsOff.includes(key),
    })
  }
  if (model) {
    add('Stable-Diffusion', model, models.checkpoints)
  }
  for (const lora of loras) {
    add('LoRA', lora.name, models.loras)
  }
  return groups
}
