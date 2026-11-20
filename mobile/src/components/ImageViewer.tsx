import { ChevronLeft, ChevronRight, Download, ImagePlus, Info, RotateCcw, Star, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { historyImageUrl } from '@/api/client'
import { parseParams, type HistoryImage } from '@/api/images'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type ImageViewerProps = {
  images: HistoryImage[]
  index: number
  /** Whether the image being shown is starred. */
  starred: boolean
  onIndex: (index: number) => void
  onClose: () => void
  onStar: (image: HistoryImage) => void
  onDelete: (image: HistoryImage) => void
  onReuse: (image: HistoryImage) => void
  onUseAsStart: (image: HistoryImage) => void
}

/** Minimum horizontal finger travel, in pixels, that counts as a swipe to the next or previous image. */
const SWIPE_DISTANCE = 50

/** Full-screen view of one saved image, with swipe navigation and the actions for managing it. */
export function ImageViewer({ images, index, starred, onIndex, onClose, onStar, onDelete, onReuse, onUseAsStart }: ImageViewerProps) {
  const image = images[index]
  const [showInfo, setShowInfo] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const touchStart = useRef<{ x: number; y: number } | null>(null)

  // Leaving an image cancels a half-confirmed delete.
  useEffect(() => {
    setConfirmDelete(false)
  }, [index])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key == 'Escape') {
        onClose()
      }
      else if (e.key == 'ArrowLeft' && index > 0) {
        onIndex(index - 1)
      }
      else if (e.key == 'ArrowRight' && index < images.length - 1) {
        onIndex(index + 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, images.length, onClose, onIndex])

  if (!image) {
    return null
  }
  const params = parseParams(image.metadata)
  const url = historyImageUrl(image.src)
  const fileName = image.src.split('/').pop() || 'image.png'

  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current
    touchStart.current = null
    // Ignore swipes while pinch-zoomed in, so panning a zoomed image does not change image.
    if (!start || (window.visualViewport && window.visualViewport.scale > 1.05)) {
      return
    }
    const dx = e.changedTouches[0].clientX - start.x
    const dy = e.changedTouches[0].clientY - start.y
    if (Math.abs(dx) < SWIPE_DISTANCE || Math.abs(dx) < Math.abs(dy) * 1.5) {
      return
    }
    if (dx < 0 && index < images.length - 1) {
      onIndex(index + 1)
    }
    else if (dx > 0 && index > 0) {
      onIndex(index - 1)
    }
  }

  return (
    <div role="dialog" aria-label="Image viewer" className="fixed inset-0 z-[60] flex flex-col bg-black">
      <div className="pt-safe flex shrink-0 items-center gap-1 px-2 pb-1">
        <Button variant="ghost" size="icon" aria-label="Close viewer" onClick={onClose}>
          <X className="size-6" />
        </Button>
        <span className="min-w-0 flex-1 text-center text-sm text-muted tabular-nums">
          {index + 1} of {images.length}
        </span>
        <Button variant="ghost" size="icon" aria-label="Image details" aria-pressed={showInfo} onClick={() => setShowInfo(!showInfo)}>
          <Info className={cn('size-6', showInfo && 'text-accent')} />
        </Button>
      </div>

      <div
        className="relative min-h-0 flex-1"
        onTouchStart={(e) => {
          touchStart.current = e.touches.length == 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null
        }}
        onTouchEnd={onTouchEnd}
      >
        <img key={image.src} src={url} alt={typeof params?.prompt == 'string' ? params.prompt : ''} className="size-full object-contain" />
        {index > 0 && (
          <button type="button" aria-label="Previous image" onClick={() => onIndex(index - 1)} className="absolute top-1/2 left-1 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/40">
            <ChevronLeft className="size-6" />
          </button>
        )}
        {index < images.length - 1 && (
          <button type="button" aria-label="Next image" onClick={() => onIndex(index + 1)} className="absolute top-1/2 right-1 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/40">
            <ChevronRight className="size-6" />
          </button>
        )}
        {showInfo && (
          <div className="absolute inset-x-2 bottom-2 max-h-[60%] overflow-y-auto overscroll-contain rounded-2xl bg-surface/95 p-3.5 text-sm backdrop-blur">
            {!params && <p className="text-muted">No generation details are stored with this image.</p>}
            {params && (
              <>
                <p className="break-words">{String(params.prompt || '(no prompt)')}</p>
                {!!params.negativeprompt && <p className="mt-1.5 break-words text-muted">Not: {String(params.negativeprompt)}</p>}
                <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-muted">
                  {(
                    [
                      ['Model', params.model],
                      ['Size', params.width && params.height ? `${params.width}×${params.height}` : undefined],
                      ['Steps', params.steps],
                      ['CFG', params.cfgscale],
                      ['Seed', params.seed],
                      ['LoRAs', Array.isArray(params.loras) ? params.loras.join(', ') : params.loras],
                      ['Creativity', params.initimagecreativity],
                    ] as [string, unknown][]
                  )
                    .filter(([, value]) => value != undefined && value !== '')
                    .map(([label, value]) => (
                      <div key={label} className="contents">
                        <dt>{label}</dt>
                        <dd className="min-w-0 break-words text-fg">{String(value)}</dd>
                      </div>
                    ))}
                </dl>
              </>
            )}
            <p className="mt-2.5 break-all text-xs text-muted">{image.src}</p>
          </div>
        )}
      </div>

      <div className="pb-safe shrink-0 px-2 pt-2">
        {confirmDelete ? (
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => setConfirmDelete(false)}>
              Keep
            </Button>
            <Button className="flex-1" variant="danger" onClick={() => onDelete(image)}>
              <Trash2 className="size-5" />
              Delete this image
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-5 gap-1">
            {(
              [
                { label: starred ? 'Unstar' : 'Star', icon: <Star className={cn('size-5.5', starred && 'fill-current text-accent')} />, run: () => onStar(image) },
                { label: 'Reuse', icon: <RotateCcw className="size-5.5" />, run: () => onReuse(image), disabled: !params },
                { label: 'Start', icon: <ImagePlus className="size-5.5" />, run: () => onUseAsStart(image) },
              ] as { label: string; icon: React.ReactNode; run: () => void; disabled?: boolean }[]
            ).map((action) => (
              <button key={action.label} type="button" disabled={action.disabled} onClick={action.run} className="flex min-h-13 flex-col items-center justify-center gap-0.5 rounded-xl text-xs active:bg-raised disabled:opacity-40">
                {action.icon}
                {action.label}
              </button>
            ))}
            <a href={url} download={fileName} className="flex min-h-13 flex-col items-center justify-center gap-0.5 rounded-xl text-xs active:bg-raised">
              <Download className="size-5.5" />
              Save
            </a>
            <button type="button" onClick={() => setConfirmDelete(true)} className="flex min-h-13 flex-col items-center justify-center gap-0.5 rounded-xl text-xs text-danger active:bg-raised">
              <Trash2 className="size-5.5" />
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
