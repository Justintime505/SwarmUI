import { Dices, Minus, Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'
import { useStore } from '@/store'

/** One labelled setting, with its current value shown at the right. */
function Row({ label, value, hint, children }: { label: string; value?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="border-b border-line py-3 last:border-b-0">
      <div className="flex items-baseline justify-between">
        <span className="font-medium">{label}</span>
        {value != undefined && <span className="text-muted tabular-nums">{value}</span>}
      </div>
      {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
      {children}
    </div>
  )
}

/** Bottom sheet with the generation settings that are changed less often than the prompt. */
export function SettingsSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const steps = useStore((s) => s.steps)
  const cfgScale = useStore((s) => s.cfgScale)
  const seed = useStore((s) => s.seed)
  const images = useStore((s) => s.images)
  const negativePrompt = useStore((s) => s.negativePrompt)
  const set = useStore((s) => s.set)
  const randomSeed = seed < 0

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Settings">
      <Row label="Steps" value={String(steps)} hint="More steps take longer. Turbo models want 4 to 12.">
        <Slider label="Steps" value={steps} min={1} max={50} step={1} onChange={(v) => set({ steps: v })} />
      </Row>

      <Row label="CFG scale" value={cfgScale.toFixed(1)} hint="How strictly to follow the prompt. Turbo models want 1.">
        <Slider label="CFG scale" value={cfgScale} min={1} max={15} step={0.5} onChange={(v) => set({ cfgScale: v })} />
      </Row>

      <Row label="Images per run" value={String(images)}>
        <div className="mt-2 flex items-center gap-3">
          <Button size="icon" aria-label="Fewer images" disabled={images <= 1} onClick={() => set({ images: images - 1 })}>
            <Minus className="size-5" />
          </Button>
          <div className="flex flex-1 justify-center gap-1.5">
            {[1, 2, 3, 4].map((n) => (
              <span key={n} className={cn('h-2 w-8 rounded-full', n <= images ? 'bg-accent' : 'bg-line')} />
            ))}
          </div>
          <Button size="icon" aria-label="More images" disabled={images >= 4} onClick={() => set({ images: images + 1 })}>
            <Plus className="size-5" />
          </Button>
        </div>
      </Row>

      <Row label="Seed" value={randomSeed ? 'Random' : undefined} hint="The same seed and settings give the same image.">
        <div className="mt-2 flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            aria-label="Seed"
            placeholder="Random each time"
            value={randomSeed ? '' : seed}
            onChange={(e) => {
              const n = Math.floor(Number(e.target.value))
              set({ seed: e.target.value == '' || !Number.isFinite(n) || n < 0 ? -1 : n })
            }}
            className="min-h-11 min-w-0 flex-1 rounded-xl bg-raised px-3 outline-none placeholder:text-muted focus:ring-1 focus:ring-accent"
          />
          <Button variant={randomSeed ? 'primary' : 'secondary'} aria-pressed={randomSeed} onClick={() => set({ seed: -1 })}>
            <Dices className="size-5" />
            Random
          </Button>
        </div>
      </Row>

      <Row label="Negative prompt" hint="Things you don't want in the image.">
        <textarea
          rows={3}
          aria-label="Negative prompt"
          placeholder="blurry, low quality…"
          value={negativePrompt}
          onChange={(e) => set({ negativePrompt: e.target.value })}
          className="mt-2 w-full resize-none rounded-xl bg-raised p-3 outline-none placeholder:text-muted focus:ring-1 focus:ring-accent"
        />
      </Row>
    </Sheet>
  )
}
