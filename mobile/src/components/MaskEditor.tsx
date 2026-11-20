import { Check, Trash2, Undo2, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { useStore, type MaskStroke } from '@/store'

/** Colour the painted area is shown in. The exported mask itself is always white on black. */
const PAINT_COLOR = '#8b6cff'

/** Draws strokes onto a canvas context, in image pixel coordinates. */
function drawStrokes(ctx: CanvasRenderingContext2D, strokes: MaskStroke[], color: string) {
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = color
  ctx.fillStyle = color
  for (const stroke of strokes) {
    const pts = stroke.points
    if (pts.length == 2) {
      // A single tap: draw a dot.
      ctx.beginPath()
      ctx.arc(pts[0], pts[1], stroke.size / 2, 0, Math.PI * 2)
      ctx.fill()
      continue
    }
    ctx.lineWidth = stroke.size
    ctx.beginPath()
    ctx.moveTo(pts[0], pts[1])
    for (let i = 2; i < pts.length; i += 2) {
      ctx.lineTo(pts[i], pts[i + 1])
    }
    ctx.stroke()
  }
}

/** Renders strokes as the mask SwarmUI expects: white where the image should change, black elsewhere. */
function exportMask(strokes: MaskStroke[], width: number, height: number): string {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, width, height)
  drawStrokes(ctx, strokes, '#fff')
  return canvas.toDataURL('image/png')
}

/** Full-screen brush for painting the part of the starting image that should be regenerated. */
export function MaskEditor({ onClose }: { onClose: () => void }) {
  const initImage = useStore((s) => s.initImage)
  const initSize = useStore((s) => s.initSize)
  const savedStrokes = useStore((s) => s.maskStrokes)
  const setMask = useStore((s) => s.setMask)
  const [strokes, setStrokes] = useState<MaskStroke[]>(savedStrokes)
  /** Brush width as a fraction of the image's longer side. */
  const [brush, setBrush] = useState(0.08)
  const [box, setBox] = useState({ width: 0, height: 0 })
  const area = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const active = useRef<MaskStroke | null>(null)
  const imgW = initSize?.width || 1
  const imgH = initSize?.height || 1

  // Fit the image inside the available area, keeping its shape, so the canvas lines up with it exactly.
  useLayoutEffect(() => {
    const el = area.current
    if (!el) {
      return
    }
    const measure = () => {
      const scale = Math.min(el.clientWidth / imgW, el.clientHeight / imgH)
      setBox({ width: Math.floor(imgW * scale), height: Math.floor(imgH * scale) })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [imgW, imgH])

  // Repaint everything whenever the stroke list changes (undo, clear, finished stroke).
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d')
    if (!ctx) {
      return
    }
    ctx.clearRect(0, 0, imgW, imgH)
    drawStrokes(ctx, strokes, PAINT_COLOR)
  }, [strokes, imgW, imgH])

  /** Converts a pointer position on screen into image pixel coordinates. */
  const toImage = (e: { clientX: number; clientY: number }): [number, number] => {
    const rect = canvas.current!.getBoundingClientRect()
    return [((e.clientX - rect.left) / rect.width) * imgW, ((e.clientY - rect.top) / rect.height) * imgH]
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (active.current) {
      return
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    const [x, y] = toImage(e)
    active.current = { size: brush * Math.max(imgW, imgH), points: [x, y] }
    drawStrokes(canvas.current!.getContext('2d')!, [active.current], PAINT_COLOR)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const stroke = active.current
    if (!stroke) {
      return
    }
    const ctx = canvas.current!.getContext('2d')!
    // Coalesced events give every sampled finger position, not just one per frame, for a smooth line.
    const events = e.nativeEvent.getCoalescedEvents?.() || []
    for (const ev of events.length > 0 ? events : [e.nativeEvent]) {
      const [x, y] = toImage(ev)
      const n = stroke.points.length
      drawStrokes(ctx, [{ size: stroke.size, points: [stroke.points[n - 2], stroke.points[n - 1], x, y] }], PAINT_COLOR)
      stroke.points.push(x, y)
    }
  }

  const onPointerUp = () => {
    const stroke = active.current
    if (stroke) {
      active.current = null
      setStrokes((prev) => [...prev, stroke])
    }
  }

  /** Saves the painted mask (or removes it if nothing is painted) and closes. */
  const done = () => {
    setMask(strokes.length > 0 ? exportMask(strokes, imgW, imgH) : null, strokes)
    onClose()
  }

  if (!initImage) {
    return null
  }
  const dotSize = Math.max(6, brush * Math.max(box.width, box.height))

  return (
    <div role="dialog" aria-label="Paint the area to change" className="pt-safe fixed inset-0 z-[60] flex flex-col bg-bg">
      <div className="flex shrink-0 items-center gap-2 px-3 pb-2">
        <Button variant="ghost" size="icon" aria-label="Discard changes and close" onClick={onClose}>
          <X className="size-6" />
        </Button>
        <p className="min-w-0 flex-1 text-center text-sm text-muted">Paint over what should change</p>
        <Button variant="primary" onClick={done}>
          <Check className="size-5" />
          Done
        </Button>
      </div>

      <div ref={area} className="flex min-h-0 flex-1 items-center justify-center px-3">
        <div className="relative overflow-hidden rounded-xl" style={{ width: box.width, height: box.height }}>
          <img src={initImage} alt="" draggable={false} className="pointer-events-none size-full select-none" />
          <canvas
            ref={canvas}
            width={imgW}
            height={imgH}
            aria-label="Painting area"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className="absolute inset-0 size-full touch-none opacity-60"
          />
        </div>
      </div>

      <div className="pb-safe shrink-0 px-4 pt-3">
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center">
            <span className="rounded-full bg-accent/70" style={{ width: Math.min(44, dotSize), height: Math.min(44, dotSize) }} />
          </span>
          <Slider label="Brush size" value={brush} min={0.02} max={0.25} step={0.01} onChange={setBrush} />
        </div>
        <div className="mt-1 flex gap-2">
          <Button className="flex-1" disabled={strokes.length == 0} onClick={() => setStrokes((prev) => prev.slice(0, -1))}>
            <Undo2 className="size-5" />
            Undo
          </Button>
          <Button className="flex-1" variant="danger" disabled={strokes.length == 0} onClick={() => setStrokes([])}>
            <Trash2 className="size-5" />
            Clear
          </Button>
        </div>
      </div>
    </div>
  )
}
