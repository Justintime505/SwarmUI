import { CircleStop, Images, Layers3, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { serverUrl } from '@/api/client'
import { isActive, type BatchJob } from '@/api/batch'
import { modelLabel } from '@/api/models'
import { useBatches } from '@/batch-store'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { useModels } from '@/models-store'
import { sizeFor, useStore } from '@/store'

/** Largest batch the server accepts. */
const MAX_COUNT = 500
/** One-tap batch sizes. */
const PRESETS = [10, 25, 50, 100]

/** Overall progress of a batch from 0 to 1, counting the image in progress. */
export function batchFraction(job: BatchJob): number {
  return Math.min(1, (job.done + (job.state == 'running' ? job.current_progress : 0)) / Math.max(1, job.total))
}

/** A short line describing where a batch stands. */
export function batchStatusText(job: BatchJob): string {
  if (job.state == 'queued') {
    return `Waiting · ${job.total} images`
  }
  if (job.state == 'running') {
    return `${job.done} of ${job.total}`
  }
  if (job.state == 'finished') {
    return `Finished · ${job.done} images`
  }
  if (job.state == 'cancelled') {
    return `Cancelled · ${job.done} of ${job.total} made`
  }
  return `Failed · ${job.done} of ${job.total} made`
}

/** One batch in the list, with its progress and actions. */
function JobCard({ job, onView }: { job: BatchJob; onView: (job: BatchJob) => void }) {
  const cancel = useBatches((s) => s.cancel)
  const dismiss = useBatches((s) => s.dismiss)
  const [busy, setBusy] = useState(false)
  const active = isActive(job)

  /** Runs a cancel or dismiss, ignoring a failure: the list reloads either way and shows the true state. */
  const act = async (work: (id: string) => Promise<void>) => {
    setBusy(true)
    try {
      await work(job.id)
    }
    catch {
      // Already gone or already ended.
    }
    setBusy(false)
  }

  return (
    <li className="rounded-2xl bg-raised p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{job.prompt || '(no prompt)'}</p>
          <p className={cn('text-sm', job.state == 'failed' ? 'text-danger' : 'text-muted')}>{batchStatusText(job)}</p>
        </div>
        {active ? (
          <Button variant="danger" disabled={busy} onClick={() => act(cancel)}>
            <CircleStop className="size-5" />
            Cancel
          </Button>
        ) : (
          <Button variant="ghost" size="icon" aria-label="Remove from list" disabled={busy} onClick={() => act(dismiss)}>
            <X className="size-5" />
          </Button>
        )}
      </div>
      {active && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={job.total} aria-valuenow={job.done}>
          <div className="h-full bg-accent transition-[width] duration-500" style={{ width: `${batchFraction(job) * 100}%` }} />
        </div>
      )}
      {job.error && job.state != 'finished' && <p className="mt-2 break-words text-sm text-danger">{job.error}</p>}
      {job.recent_images.length > 0 && (
        <div className="mt-2 flex items-center gap-1.5">
          <div className="no-scrollbar flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
            {job.recent_images.map((src) => (
              <img key={src} src={`${serverUrl(src)}?preview=true`} alt="" loading="lazy" className="size-12 shrink-0 rounded-lg bg-surface object-cover" />
            ))}
          </div>
          <Button onClick={() => onView(job)}>
            <Images className="size-5" />
            View
          </Button>
        </div>
      )}
    </li>
  )
}

type BatchSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Which part to show when opened: the form to start a batch, or the list of batches. */
  view: 'start' | 'list'
  onViewChange: (view: 'start' | 'list') => void
  /** Opens the gallery on the folder a batch saved into. */
  onViewImages: (job: BatchJob) => void
}

/** Bottom sheet for starting a background batch and for watching or cancelling the ones in progress. */
export function BatchSheet({ open, onOpenChange, view, onViewChange, onViewImages }: BatchSheetProps) {
  const jobs = useBatches((s) => s.jobs)
  const start = useBatches((s) => s.start)
  const load = useBatches((s) => s.load)
  const modelName = useStore((s) => s.model)
  const aspect = useStore((s) => s.aspect)
  const side = useStore((s) => s.side)
  const folder = useStore((s) => s.folder)
  const prompt = useStore((s) => s.prompt)
  const initImage = useStore((s) => s.initImage)
  const model = useModels((s) => s.checkpoints.find((m) => m.name == modelName))
  const [count, setCount] = useState(25)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [width, height] = sizeFor(aspect, side)
  const waiting = jobs.filter(isActive).length

  useEffect(() => {
    if (open) {
      setError(null)
      load()
    }
  }, [open, load])

  const onStart = async () => {
    setBusy(true)
    setError(null)
    try {
      await start(count)
      onViewChange('list')
    }
    catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
    setBusy(false)
  }

  // Newest first, with anything still going above what has ended.
  const ordered = [...jobs].sort((a, b) => Number(isActive(b)) - Number(isActive(a)) || b.created - a.created)
  const countOk = Number.isInteger(count) && count >= 1 && count <= MAX_COUNT

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={view == 'start' ? 'Generate a batch' : 'Batches'}
      size={view == 'list' ? 'full' : 'auto'}
      action={
        view == 'list' ? (
          <Button variant="ghost" className="text-accent" onClick={() => onViewChange('start')}>
            New batch
          </Button>
        ) : jobs.length > 0 ? (
          <Button variant="ghost" className="text-accent" onClick={() => onViewChange('list')}>
            Show batches
          </Button>
        ) : undefined
      }
    >
      {view == 'start' && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">
            Makes this many images with your current prompt and settings, each with a new random seed. It runs on the server, so it keeps going if you close the app.
          </p>
          <div role="group" aria-label="Number of images" className="grid grid-cols-4 gap-2">
            {PRESETS.map((n) => (
              <button key={n} type="button" aria-pressed={count == n} onClick={() => setCount(n)} className={cn('min-h-12 rounded-2xl text-lg font-medium', count == n ? 'bg-accent text-accent-fg' : 'bg-raised active:bg-line')}>
                {n}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-3">
            <span className="shrink-0 text-muted">Or exactly</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_COUNT}
              aria-label="Number of images"
              value={Number.isFinite(count) ? count : ''}
              onChange={(e) => setCount(e.target.value == '' ? NaN : Math.floor(Number(e.target.value)))}
              className="min-h-11 min-w-0 flex-1 rounded-xl bg-raised px-3 outline-none focus:ring-1 focus:ring-accent"
            />
            <span className="shrink-0 text-muted">images</span>
          </label>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 rounded-2xl bg-raised p-3 text-sm">
            <dt className="text-muted">Model</dt>
            <dd className="truncate">{model ? modelLabel(model) : 'None chosen'}</dd>
            <dt className="text-muted">Size</dt>
            <dd>
              {width}×{height}
            </dd>
            <dt className="text-muted">Saves to</dt>
            <dd className="truncate">{folder || 'Default (by day)'}</dd>
            {initImage && (
              <>
                <dt className="text-muted">Start image</dt>
                <dd>On</dd>
              </>
            )}
            <dt className="text-muted">Prompt</dt>
            <dd className="line-clamp-2 break-words">{prompt || '(empty)'}</dd>
          </dl>
          {waiting > 0 && <p className="text-sm text-muted">{waiting == 1 ? 'A batch is already going. This one will start when it finishes.' : `${waiting} batches are ahead of this one.`}</p>}
          <Button variant="primary" size="lg" disabled={busy || !countOk || !modelName} onClick={onStart}>
            <Layers3 className="size-5" />
            {countOk ? `Start ${count} images` : `Choose 1 to ${MAX_COUNT}`}
          </Button>
        </div>
      )}

      {view == 'list' && (
        <>
          {ordered.length == 0 && <p className="py-10 text-center text-muted">No batches. Start one with "New batch".</p>}
          <ul className="flex flex-col gap-2">
            {ordered.map((job) => (
              <JobCard key={job.id} job={job} onView={onViewImages} />
            ))}
          </ul>
        </>
      )}

      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-danger/15 p-3 text-sm text-danger">
          {error}
        </p>
      )}
    </Sheet>
  )
}
