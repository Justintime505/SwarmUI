import { Check, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { modelLabel } from '@/api/models'
import { ModelThumb } from '@/components/ModelThumb'
import { Sheet } from '@/components/ui/sheet'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'
import { useModels } from '@/models-store'
import { useStore } from '@/store'

/** Full-height sheet for turning LoRAs on and off and setting each one's strength. */
export function LoraPicker({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const loras = useModels((s) => s.loras)
  const chosen = useStore((s) => s.loras)
  const toggleLora = useStore((s) => s.toggleLora)
  const setLoraWeight = useStore((s) => s.setLoraWeight)
  const [query, setQuery] = useState('')
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return loras.filter((m) => !q || `${m.name} ${m.title || ''}`.toLowerCase().includes(q))
  }, [loras, query])

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={chosen.length > 0 ? `LoRAs (${chosen.length} on)` : 'LoRAs'} size="full">
      {loras.length == 0 && (
        <p className="py-10 text-center text-muted">No LoRAs found. Add some to SwarmUI's Models/Lora folder, then refresh the model list.</p>
      )}
      {loras.length > 0 && (
        <label className="sticky top-0 z-10 mb-3 flex min-h-11 items-center gap-2 rounded-xl bg-raised px-3">
          <Search className="size-4.5 shrink-0 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search LoRAs"
            aria-label="Search LoRAs"
            className="min-w-0 flex-1 bg-transparent py-2.5 outline-none placeholder:text-muted"
          />
        </label>
      )}
      {loras.length > 0 && visible.length == 0 && <p className="py-10 text-center text-muted">No LoRAs match "{query}".</p>}
      <ul className="flex flex-col gap-1.5">
        {visible.map((model) => {
          const choice = chosen.find((l) => l.name == model.name)
          const defaultWeight = Number(model.lora_default_weight) || 1
          return (
            <li key={model.name} className={cn('rounded-2xl', choice ? 'bg-accent/15 ring-1 ring-accent' : 'bg-raised')}>
              <button
                type="button"
                aria-pressed={!!choice}
                onClick={() => toggleLora(model.name, defaultWeight)}
                className="flex w-full items-center gap-3 rounded-2xl p-2.5 text-left active:bg-line"
              >
                <ModelThumb model={model} className="size-14" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{modelLabel(model)}</span>
                  <span className="block truncate text-sm text-muted">{model.class || model.architecture || 'LoRA'}</span>
                </span>
                {choice && <Check className="mr-1 size-5 shrink-0 text-accent" />}
              </button>
              {choice && (
                <div className="flex items-center gap-3 px-3.5 pb-2">
                  <span className="text-sm text-muted">Strength</span>
                  <Slider
                    label={`Strength of ${modelLabel(model)}`}
                    value={choice.weight}
                    min={0}
                    max={2}
                    step={0.05}
                    onChange={(weight) => setLoraWeight(model.name, weight)}
                  />
                  <span className="w-10 text-right text-sm tabular-nums">{choice.weight.toFixed(2)}</span>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </Sheet>
  )
}
