import { ChevronDown, Folder, ImagePlus, Images, Layers, RefreshCw, SlidersHorizontal, Sparkles, Square, X } from 'lucide-react'
import { useState } from 'react'
import { serverUrl } from '@/api/client'
import { modelLabel } from '@/api/models'
import { FolderPicker } from '@/components/FolderPicker'
import { GenerateMenu } from '@/components/GenerateMenu'
import { InitImageSheet } from '@/components/InitImageSheet'
import { LoraPicker } from '@/components/LoraPicker'
import { MaskEditor } from '@/components/MaskEditor'
import { ModelPicker } from '@/components/ModelPicker'
import { ModelThumb } from '@/components/ModelThumb'
import { ProfileSwitcher } from '@/components/ProfileSwitcher'
import { SettingsSheet } from '@/components/SettingsSheet'
import { Button } from '@/components/ui/button'
import { useLongPress } from '@/lib/use-long-press'
import { cn } from '@/lib/utils'
import { useModels } from '@/models-store'
import { ASPECTS, sizeFor, useStore } from '@/store'

type SheetName = 'model' | 'settings' | 'loras' | 'init' | 'mask' | 'folder' | 'menu' | null

/** Small outline showing an aspect ratio's shape. */
function AspectIcon({ aspect }: { aspect: string }) {
  const [w, h] = ASPECTS[aspect]
  const scale = 16 / Math.max(w, h)
  return <span className="block rounded-[3px] border-[1.5px] border-current" style={{ width: w * scale, height: h * scale }} />
}

/** Button that opens the model picker and always shows which model is active. */
function ModelButton({ onClick }: { onClick: () => void }) {
  const modelName = useStore((s) => s.model)
  const { checkpoints, loading } = useModels()
  const model = checkpoints.find((m) => m.name == modelName)
  return (
    <button type="button" onClick={onClick} className="flex min-h-12 min-w-0 flex-1 items-center gap-2.5 rounded-2xl bg-surface p-1.5 pr-3 text-left active:bg-raised">
      <ModelThumb model={model} className="size-9" />
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] leading-tight text-muted">Model</span>
        <span className="block truncate leading-tight font-medium">{model ? modelLabel(model) : loading ? 'Loading…' : 'Choose a model'}</span>
      </span>
      <ChevronDown className="size-5 shrink-0 text-muted" />
    </button>
  )
}

/** The image area: live preview while generating, otherwise the selected result. */
function Stage({ onUseAsStart }: { onUseAsStart: (src: string) => void }) {
  const running = useStore((s) => s.running)
  const preview = useStore((s) => s.preview)
  const progress = useStore((s) => s.progress)
  const statusText = useStore((s) => s.statusText)
  const results = useStore((s) => s.results)
  const current = useStore((s) => s.current)
  const error = useStore((s) => s.error)
  const dismissError = useStore((s) => s.dismissError)
  const modelsError = useModels((s) => s.error)
  const loadModels = useModels((s) => s.load)
  const [zoomed, setZoomed] = useState(false)
  const result = results[current]
  const shown = running && preview ? preview : result ? serverUrl(result.src) : null

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden rounded-3xl bg-surface">
      {shown && (
        <button type="button" aria-label="View image full screen" disabled={running} onClick={() => setZoomed(true)} className="block size-full">
          <img src={shown} alt="" className={cn('size-full object-contain transition-opacity', running && !preview && 'opacity-40')} />
        </button>
      )}
      {!shown && !modelsError && (
        <div className="flex size-full flex-col items-center justify-center gap-2 px-8 text-center text-muted">
          <Sparkles className="size-9" strokeWidth={1.25} />
          <p role={running ? 'status' : undefined}>{running ? statusText : 'Describe an image below and tap Generate.'}</p>
        </div>
      )}
      {modelsError && !shown && (
        <div className="flex size-full flex-col items-center justify-center gap-3 px-8 text-center">
          <p className="text-danger">Can't reach SwarmUI.</p>
          <p className="text-sm text-muted">{modelsError}</p>
          <Button onClick={() => loadModels()}>
            <RefreshCw className="size-5" />
            Try again
          </Button>
        </div>
      )}

      {running && (
        <>
          <div className="absolute inset-x-0 top-0 h-1 bg-black/40">
            <div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${Math.max(2, progress * 100)}%` }} />
          </div>
          {shown && (
            <div role="status" className="absolute top-3 left-3 rounded-full bg-black/65 px-3 py-1 text-sm backdrop-blur">
              {statusText}
              {progress > 0 && <span className="ml-1.5 tabular-nums">{Math.round(progress * 100)}%</span>}
            </div>
          )}
        </>
      )}

      {result && !running && (
        <Button className="absolute right-3 bottom-3 bg-black/65 backdrop-blur" onClick={() => onUseAsStart(serverUrl(result.src))}>
          <ImagePlus className="size-5" />
          Use as start
        </Button>
      )}

      {error && (
        <div role="alert" className="absolute inset-x-3 top-3 flex items-start gap-2 rounded-2xl bg-danger px-3 py-2 text-sm text-white">
          <span className="min-w-0 flex-1 break-words">{error}</span>
          <button type="button" aria-label="Dismiss error" onClick={dismissError} className="-m-2 p-2">
            <X className="size-5" />
          </button>
        </div>
      )}

      {zoomed && result && (
        <button type="button" aria-label="Close full screen image" onClick={() => setZoomed(false)} className="fixed inset-0 z-30 bg-black">
          <img src={serverUrl(result.src)} alt="" className="size-full object-contain" />
        </button>
      )}
    </div>
  )
}

/** The main screen: image on top, options and prompt at the bottom within thumb reach. */
export function GenerateScreen({ onOpenGallery }: { onOpenGallery: () => void }) {
  const [sheet, setSheet] = useState<SheetName>(null)
  const prompt = useStore((s) => s.prompt)
  const aspect = useStore((s) => s.aspect)
  const side = useStore((s) => s.side)
  const steps = useStore((s) => s.steps)
  const cfgScale = useStore((s) => s.cfgScale)
  const model = useStore((s) => s.model)
  const loras = useStore((s) => s.loras)
  const initImage = useStore((s) => s.initImage)
  const maskImage = useStore((s) => s.maskImage)
  const running = useStore((s) => s.running)
  const cancelling = useStore((s) => s.cancelling)
  const results = useStore((s) => s.results)
  const current = useStore((s) => s.current)
  const set = useStore((s) => s.set)
  const showResult = useStore((s) => s.showResult)
  const startFromUrl = useStore((s) => s.startFromUrl)
  const folder = useStore((s) => s.folder)
  const generate = useStore((s) => s.generate)
  const cancel = useStore((s) => s.cancel)
  const forever = useStore((s) => s.forever)
  const previews = useStore((s) => s.previews)
  const toggleForever = useStore((s) => s.toggleForever)
  const togglePreviews = useStore((s) => s.togglePreviews)
  // Holding Generate (or Cancel) opens the extra options the desktop UI keeps behind its arrow button.
  const longPress = useLongPress(() => setSheet('menu'))
  const [width, height] = sizeFor(aspect, side)

  /** Makes a finished result the starting image for the next generation. */
  const useAsStart = async (src: string) => {
    if (await startFromUrl(src)) {
      setSheet('init')
    }
  }

  /** Closes whichever sheet is open. */
  const sheetProps = (name: SheetName) => ({
    open: sheet == name,
    onOpenChange: (open: boolean) => setSheet(open ? name : null),
  })

  return (
    <div className="pt-safe mx-auto flex h-dvh max-w-xl flex-col gap-2 px-3">
      <header className="flex shrink-0 items-center gap-2">
        <ModelButton onClick={() => setSheet('model')} />
        <ProfileSwitcher />
        <Button size="icon" className="size-12 rounded-2xl bg-surface" aria-label="Open gallery" onClick={onOpenGallery}>
          <Images className="size-5.5" />
        </Button>
      </header>

      <Stage onUseAsStart={useAsStart} />

      {results.length > 1 && (
        <div className="no-scrollbar -mx-3 flex shrink-0 gap-2 overflow-x-auto px-3">
          {results.map((r, i) => (
            <button
              key={r.src.slice(-80) + i}
              type="button"
              aria-label={`Show image ${i + 1}`}
              aria-pressed={i == current}
              onClick={() => showResult(i)}
              className={cn('size-14 shrink-0 overflow-hidden rounded-xl', i == current ? 'ring-2 ring-accent' : 'opacity-60')}
            >
              <img src={serverUrl(r.src)} alt="" loading="lazy" className="size-full object-cover" />
            </button>
          ))}
        </div>
      )}

      <div className="pb-safe flex shrink-0 flex-col gap-2">
        <div role="group" aria-label="Aspect ratio" className="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3">
          {Object.keys(ASPECTS).map((name) => (
            <button
              key={name}
              type="button"
              aria-pressed={name == aspect}
              onClick={() => set({ aspect: name })}
              className={cn(
                'flex min-h-11 shrink-0 items-center gap-2 rounded-full px-3.5 text-sm',
                name == aspect ? 'bg-accent text-accent-fg' : 'bg-surface text-muted active:bg-raised',
              )}
            >
              <span className="flex size-4 items-center justify-center">
                <AspectIcon aspect={name} />
              </span>
              {name}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Button className="min-w-0 flex-col gap-0 rounded-2xl bg-surface px-2 py-1.5 whitespace-nowrap" onClick={() => setSheet('settings')}>
            <span className="flex items-center gap-1.5">
              <SlidersHorizontal className="size-4" />
              Settings
            </span>
            <span className="max-w-full truncate text-xs font-normal text-muted">
              {steps} steps · CFG {cfgScale}
            </span>
          </Button>
          <Button className={cn('min-w-0 flex-col gap-0 rounded-2xl bg-surface px-2 py-1.5 whitespace-nowrap', loras.length > 0 && 'ring-1 ring-accent')} onClick={() => setSheet('loras')}>
            <span className="flex items-center gap-1.5">
              <Layers className="size-4" />
              LoRAs
            </span>
            <span className="max-w-full truncate text-xs font-normal text-muted">{loras.length > 0 ? `${loras.length} on` : 'None'}</span>
          </Button>
          <Button className={cn('min-w-0 flex-col gap-0 rounded-2xl bg-surface px-2 py-1.5 whitespace-nowrap', initImage && 'ring-1 ring-accent')} onClick={() => setSheet('init')}>
            <span className="flex items-center gap-1.5">
              {initImage ? <img src={initImage} alt="" className="size-4 rounded-sm object-cover" /> : <ImagePlus className="size-4" />}
              Start image
            </span>
            <span className="max-w-full truncate text-xs font-normal text-muted">{initImage ? (maskImage ? 'Inpaint' : 'On') : 'None'}</span>
          </Button>
        </div>

        <textarea
          rows={2}
          aria-label="Prompt"
          placeholder="Describe the image…"
          value={prompt}
          onChange={(e) => set({ prompt: e.target.value })}
          className="max-h-36 min-h-[4.25rem] w-full resize-none rounded-2xl bg-surface p-3.5 leading-snug outline-none [field-sizing:content] placeholder:text-muted focus:ring-1 focus:ring-accent"
        />

        {(forever || previews) && (
          <div className="flex min-h-11 items-center gap-2 rounded-2xl bg-accent/15 pr-1 pl-3.5 text-sm">
            <span className="min-w-0 flex-1 truncate">{forever ? 'Generating forever' : 'Live previews on (not saved)'}</span>
            <Button variant="ghost" className="text-accent" onClick={() => (forever ? toggleForever() : togglePreviews())}>
              Stop
            </Button>
          </div>
        )}
        {running ? (
          <Button variant="danger" size="lg" disabled={cancelling} onClick={cancel} aria-haspopup="dialog" style={{ WebkitTouchCallout: 'none' }} {...longPress}>
            <Square className="size-4 fill-current" />
            {cancelling ? 'Cancelling…' : 'Cancel'}
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button size="lg" className="max-w-[38%] min-w-0 shrink-0 bg-surface px-3.5" aria-label={`Save to folder: ${folder || 'Default'}`} onClick={() => setSheet('folder')}>
              <Folder className="size-5 shrink-0" />
              <span className="truncate text-sm">{folder || 'Default'}</span>
            </Button>
            <Button variant="primary" size="lg" className="min-w-0 flex-1" disabled={!model} onClick={() => generate()} aria-haspopup="dialog" title="Hold for more options" style={{ WebkitTouchCallout: 'none' }} {...longPress}>
              <Sparkles className="size-5 shrink-0" />
              Generate
              <span className="truncate text-sm font-normal opacity-75">
                {width}×{height}
              </span>
            </Button>
          </div>
        )}
      </div>

      <ModelPicker {...sheetProps('model')} />
      <SettingsSheet {...sheetProps('settings')} />
      <LoraPicker {...sheetProps('loras')} />
      <FolderPicker {...sheetProps('folder')} />
      <GenerateMenu {...sheetProps('menu')} />
      <InitImageSheet {...sheetProps('init')} onPaint={() => setSheet('mask')} />
      {sheet == 'mask' && <MaskEditor onClose={() => setSheet('init')} />}
    </div>
  )
}
