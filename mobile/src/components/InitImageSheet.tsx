import { Brush, ImagePlus, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { Slider } from '@/components/ui/slider'
import { fileToScaledDataUrl } from '@/lib/utils'
import { useStore } from '@/store'

/** Bottom sheet for image-to-image: pick a starting image and how far the result may drift from it. */
export function InitImageSheet({ open, onOpenChange, onPaint }: { open: boolean; onOpenChange: (open: boolean) => void; onPaint: () => void }) {
  const initImage = useStore((s) => s.initImage)
  const initCreativity = useStore((s) => s.initCreativity)
  const setInitImage = useStore((s) => s.setInitImage)
  const maskImage = useStore((s) => s.maskImage)
  const setMask = useStore((s) => s.setMask)
  const set = useStore((s) => s.set)
  const fileInput = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  /** Loads the chosen photo, scaled down, as the starting image. */
  const onFile = async (file: File | undefined) => {
    if (!file) {
      return
    }
    try {
      const { dataUrl, width, height } = await fileToScaledDataUrl(file)
      setInitImage(dataUrl, width, height)
      setError(null)
    }
    catch {
      setError('That file could not be read as an image.')
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Starting image">
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          onFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      {!initImage && (
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="flex w-full flex-col items-center gap-2 rounded-2xl border border-dashed border-line px-4 py-10 text-muted active:bg-raised"
        >
          <ImagePlus className="size-8" strokeWidth={1.5} />
          <span className="font-medium text-fg">Choose a photo</span>
          <span className="text-center text-sm">The new image starts from this one instead of from nothing.</span>
        </button>
      )}
      {initImage && (
        <>
          <img src={initImage} alt="Starting image" className="mx-auto max-h-[30dvh] rounded-2xl object-contain" />
          <div className="mt-3 flex items-baseline justify-between">
            <span className="font-medium">Creativity</span>
            <span className="text-muted tabular-nums">{Math.round(initCreativity * 100)}%</span>
          </div>
          <p className="text-sm text-muted">Low keeps close to the starting image. High changes more.</p>
          <Slider label="Creativity" value={initCreativity} min={0.05} max={1} step={0.05} onChange={(v) => set({ initCreativity: v })} />
          <div className="mt-1 flex gap-2">
            <Button className={maskImage ? 'flex-1 ring-1 ring-accent' : 'flex-1'} onClick={onPaint}>
              <Brush className="size-5" />
              {maskImage ? 'Edit painted area' : 'Paint area to change'}
            </Button>
            {maskImage && (
              <Button aria-label="Remove painted area" onClick={() => setMask(null, [])}>
                Clear
              </Button>
            )}
          </div>
          <p className="mt-1 text-sm text-muted">{maskImage ? 'Only the painted area will change.' : 'Without painting, the whole image changes.'}</p>
          <div className="mt-2 flex gap-2">
            <Button className="flex-1" onClick={() => fileInput.current?.click()}>
              <ImagePlus className="size-5" />
              Replace
            </Button>
            <Button className="flex-1" variant="danger" onClick={() => setInitImage(null)}>
              <Trash2 className="size-5" />
              Remove
            </Button>
          </div>
        </>
      )}
      {error && <p className="mt-3 rounded-xl bg-danger/15 p-3 text-sm text-danger">{error}</p>}
    </Sheet>
  )
}
