import { Check, RefreshCw, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { modelFolder, modelLabel, type SwarmModel } from '@/api/models'
import { ModelThumb } from '@/components/ModelThumb'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { useModels } from '@/models-store'
import { useStore } from '@/store'

/** Groups models by folder, keeping only those matching the search text. */
function groupModels(models: SwarmModel[], query: string): [string, SwarmModel[]][] {
  const q = query.trim().toLowerCase()
  const groups = new Map<string, SwarmModel[]>()
  for (const model of models) {
    if (q && !`${model.name} ${model.title || ''}`.toLowerCase().includes(q)) {
      continue
    }
    const folder = modelFolder(model)
    if (!groups.has(folder)) {
      groups.set(folder, [])
    }
    groups.get(folder)!.push(model)
  }
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))
}

/** Full-height sheet for choosing the main image model. */
export function ModelPicker({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { checkpoints, loading, error, load } = useModels()
  const selected = useStore((s) => s.model)
  const selectModel = useStore((s) => s.selectModel)
  const [query, setQuery] = useState('')
  const groups = useMemo(() => groupModels(checkpoints, query), [checkpoints, query])

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Model"
      size="full"
      action={
        <Button variant="ghost" size="icon" aria-label="Refresh model list" onClick={() => load()} disabled={loading}>
          <RefreshCw className={cn('size-5', loading && 'animate-spin')} />
        </Button>
      }
    >
      <label className="sticky top-0 z-10 mb-3 flex min-h-11 items-center gap-2 rounded-xl bg-raised px-3">
        <Search className="size-4.5 shrink-0 text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search models"
          aria-label="Search models"
          className="min-w-0 flex-1 bg-transparent py-2.5 outline-none placeholder:text-muted"
        />
      </label>

      {error && <p className="rounded-xl bg-danger/15 p-3 text-sm text-danger">{error}</p>}
      {!error && !loading && checkpoints.length == 0 && (
        <p className="py-10 text-center text-muted">No models found. Add one to SwarmUI's Models/Stable-Diffusion folder, then refresh.</p>
      )}
      {!error && checkpoints.length > 0 && groups.length == 0 && <p className="py-10 text-center text-muted">No models match "{query}".</p>}

      {groups.map(([folder, models]) => (
        <section key={folder} className="mb-4">
          {folder && <h3 className="mb-1.5 px-1 text-xs font-semibold tracking-wide text-muted uppercase">{folder}</h3>}
          <ul className="flex flex-col gap-1.5">
            {models.map((model) => {
              const active = model.name == selected
              return (
                <li key={model.name}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      selectModel(model)
                      onOpenChange(false)
                    }}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-2xl p-2.5 text-left active:bg-line',
                      active ? 'bg-accent/15 ring-1 ring-accent' : 'bg-raised',
                    )}
                  >
                    <ModelThumb model={model} className="size-16" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{modelLabel(model)}</span>
                      <span className="block truncate text-sm text-muted">{model.class || model.architecture || 'Unknown type'}</span>
                      <span className="block truncate text-xs text-muted/70">
                        {model.standard_width > 0 ? `${model.standard_width}×${model.standard_height}` : ''}
                        {model.loaded ? ' · loaded' : ''}
                      </span>
                    </span>
                    {active && <Check className="mr-1 size-5 shrink-0 text-accent" />}
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </Sheet>
  )
}
