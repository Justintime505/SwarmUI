import { Check, Tags } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { useModels } from '@/models-store'
import { useStore } from '@/store'
import { tagGroupsFor, useTags, type TagGroup } from '@/tags-store'

/** The tag groups for the model and LoRAs chosen now. Re-renders when the choice, the model lists or the saved tags change. */
function useTagGroups(): TagGroup[] {
  const model = useStore((s) => s.model)
  const loras = useStore((s) => s.loras)
  const tagsOff = useStore((s) => s.tagsOff)
  // Subscribed to only so a change re-renders: `tagGroupsFor` reads these lists itself.
  useModels((s) => s.checkpoints)
  useModels((s) => s.loras)
  useTags((s) => s.negatives)
  return tagGroupsFor(model, loras, tagsOff)
}

/** A line under the prompt showing the tags the chosen model and LoRAs add. Tap a chip to switch its tags off or on. */
export function TagsRow({ onEdit }: { onEdit: () => void }) {
  const groups = useTagGroups()
  const toggleTags = useStore((s) => s.toggleTags)
  const tagged = groups.filter((g) => g.positive || g.negative)
  if (groups.length == 0) {
    return null
  }
  return (
    <div className="flex items-center gap-1.5">
      <div className="no-scrollbar flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
        {tagged.length == 0 && (
          <button type="button" onClick={onEdit} className="min-h-11 rounded-2xl px-1 text-left text-sm text-muted">
            No tags are added for this model. Tap to add some.
          </button>
        )}
        {tagged.map((g) => (
          <button
            key={g.key}
            type="button"
            aria-pressed={g.on}
            aria-label={`Tags from ${g.label}: ${g.positive || g.negative}. ${g.on ? 'On' : 'Off'}`}
            onClick={() => toggleTags(g.key)}
            className={cn('flex min-h-11 max-w-60 shrink-0 flex-col justify-center rounded-2xl px-3 text-left', g.on ? 'bg-accent/15' : 'bg-surface text-muted')}
          >
            <span className="max-w-full truncate text-xs text-muted">
              {g.label}
              {!g.on && ' · off'}
            </span>
            <span className={cn('max-w-full truncate text-sm', !g.on && 'line-through')}>{g.positive || `− ${g.negative}`}</span>
          </button>
        ))}
      </div>
      <Button variant="ghost" size="icon" aria-label="Edit tags" onClick={onEdit}>
        <Tags className="size-5" />
      </Button>
    </div>
  )
}

/** The editor for one model's or LoRA's tags. */
function GroupEditor({ group }: { group: TagGroup }) {
  const save = useTags((s) => s.save)
  const supported = useTags((s) => s.supported)
  const toggleTags = useStore((s) => s.toggleTags)
  const [positive, setPositive] = useState(group.positive)
  const [negative, setNegative] = useState(group.negative)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirty = positive.trim() != group.positive || negative.trim() != group.negative

  /** Saves both fields on the server and shows the tidied result. */
  const onSave = async () => {
    setBusy(true)
    setError(null)
    try {
      await save(group.subtype, group.name, positive, negative)
      const now = tagGroupsFor(useStore.getState().model, useStore.getState().loras, []).find((g) => g.key == group.key)
      setPositive(now?.positive ?? positive.trim())
      setNegative(now?.negative ?? negative.trim())
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
    catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
    setBusy(false)
  }

  const fieldClass = 'mt-1 min-h-11 w-full resize-none rounded-xl bg-surface p-3 leading-snug outline-none [field-sizing:content] placeholder:text-muted focus:ring-1 focus:ring-accent disabled:opacity-60'
  return (
    <li className="rounded-2xl bg-raised p-3">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{group.label}</p>
          <p className="text-sm text-muted">{group.subtype == 'LoRA' ? 'LoRA' : 'Model'}</p>
        </div>
        <Button aria-pressed={group.on} className={cn(group.on && 'bg-accent/15 text-accent')} onClick={() => toggleTags(group.key)}>
          {group.on ? 'On' : 'Off'}
        </Button>
      </div>
      <label className="mt-2 block text-sm text-muted">
        Add to the prompt
        <textarea rows={2} value={positive} disabled={!supported} onChange={(e) => setPositive(e.target.value)} placeholder="masterpiece, best quality" className={cn(fieldClass, 'text-fg')} />
      </label>
      <label className="mt-2 block text-sm text-muted">
        Add to the negative prompt
        <textarea rows={2} value={negative} disabled={!supported} onChange={(e) => setNegative(e.target.value)} placeholder="bad quality, worst quality" className={cn(fieldClass, 'text-fg')} />
      </label>
      {error && (
        <p role="alert" className="mt-2 break-words text-sm text-danger">
          {error}
        </p>
      )}
      <Button variant="primary" className="mt-2 w-full" disabled={busy || !dirty || !supported} onClick={onSave}>
        {saved && !dirty && <Check className="size-5" />}
        {busy ? 'Saving…' : saved && !dirty ? 'Saved' : 'Save'}
      </Button>
    </li>
  )
}

/** Bottom sheet for editing the tags that the chosen model and LoRAs add to prompts. */
export function TagsSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const groups = useTagGroups()
  const supported = useTags((s) => s.supported)
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Tags" size="full">
      <p className="text-sm text-muted">
        Tags each model wants in every prompt, such as quality tags or a LoRA's trigger words. They are added in front of what you type, without repeats. They are saved on the server with the model, so every profile and the desktop page share
        them.
      </p>
      {!supported && <p className="mt-2 rounded-xl bg-danger/15 p-3 text-sm text-danger">This server cannot save tags. Tags already stored with a model are still used.</p>}
      {groups.length == 0 && <p className="py-10 text-center text-muted">Choose a model first.</p>}
      <ul className="mt-3 flex flex-col gap-2">
        {groups.map((g) => (
          <GroupEditor key={g.key} group={g} />
        ))}
      </ul>
    </Sheet>
  )
}
