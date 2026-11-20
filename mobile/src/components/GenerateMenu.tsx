import { CircleStop, Eye, Infinity as InfinityIcon, OctagonX, RefreshCcw, Sparkles, Type } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { api } from '@/api/client'
import { Sheet } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { useStore } from '@/store'

type Token = { id: number; weight: number; text: string }

/** One tappable row of the menu. */
function Row({ icon, label, hint, active, danger, disabled, onClick }: { icon: ReactNode; label: string; hint?: string; active?: boolean; danger?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <li>
      <button
        type="button"
        disabled={disabled}
        aria-pressed={active}
        onClick={onClick}
        className={cn(
          'flex min-h-13 w-full items-center gap-3 rounded-2xl px-3.5 py-2 text-left active:bg-line disabled:opacity-40',
          active ? 'bg-accent/15 ring-1 ring-accent' : 'bg-raised',
          danger && 'text-danger',
        )}
      >
        <span className="shrink-0">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{label}</span>
          {hint && <span className={cn('block text-sm', danger ? 'text-danger/70' : 'text-muted')}>{hint}</span>}
        </span>
      </button>
    </li>
  )
}

/** The extra Generate options from the desktop UI's arrow menu, opened by long-pressing Generate. */
export function GenerateMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const running = useStore((s) => s.running)
  const forever = useStore((s) => s.forever)
  const previews = useStore((s) => s.previews)
  const model = useStore((s) => s.model)
  const prompt = useStore((s) => s.prompt)
  const [tokens, setTokens] = useState<Token[] | null>(null)
  const [tokenError, setTokenError] = useState<string | null>(null)

  /** Closes the menu, then runs an action. */
  const run = (action: () => void) => () => {
    onOpenChange(false)
    action()
  }

  /** Asks SwarmUI how the prompt splits into tokens and shows the result in place. */
  const tokenize = async () => {
    setTokenError(null)
    try {
      const data = await api<{ tokens: Token[] }>('TokenizeInDetail', { text: prompt, tokenset: 'clip', weighting: true })
      setTokens(data.tokens || [])
    }
    catch (err) {
      setTokenError(err instanceof Error ? err.message : String(err))
    }
  }

  const store = useStore.getState

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setTokens(null)
          setTokenError(null)
        }
        onOpenChange(next)
      }}
      title={tokens ? 'Prompt tokens' : 'Generate options'}
    >
      {tokens ? (
        <>
          <p className="text-sm text-muted">
            {tokens.length} tokens, counted the way SDXL-style models read a prompt. They work in chunks of 75. Newer models such as Z-Image and Flux split text differently.
          </p>
          {tokens.length == 0 && <p className="py-6 text-center text-muted">The prompt is empty.</p>}
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {tokens.map((token, i) => (
              <li key={i} className={cn('rounded-lg px-2 py-1 text-sm', token.weight != 1 ? 'bg-accent/25' : 'bg-raised')}>
                {token.text.replace('</w>', '')}
                {token.weight != 1 && <span className="ml-1 text-xs text-muted">×{token.weight}</span>}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <ul className="flex flex-col gap-1.5">
          <Row icon={<Sparkles className="size-5" />} label="Generate" disabled={!model || running} onClick={run(() => store().generate())} />
          <Row
            icon={<InfinityIcon className="size-5" />}
            label={forever ? 'Stop generating forever' : 'Generate forever'}
            hint={forever ? 'The current image still finishes.' : 'Keeps making new images until you stop it. Uses a new random seed each time.'}
            active={forever}
            disabled={!model}
            onClick={run(() => store().toggleForever())}
          />
          <Row
            icon={<Eye className="size-5" />}
            label={previews ? 'Stop generating previews' : 'Generate previews'}
            hint={previews ? 'Previews are not saved.' : 'Makes a quick unsaved image each time you change the prompt or settings. Best with a fixed seed.'}
            active={previews}
            disabled={!model}
            onClick={run(() => store().togglePreviews())}
          />
          <Row icon={<RefreshCcw className="size-5" />} label="Interrupt and generate" hint="Stops the current image and starts again with the settings as they are now." disabled={!model} onClick={run(() => store().interruptAndGenerate())} />
          <Row icon={<CircleStop className="size-5" />} label="Interrupt current session" hint="Stops what this device started." danger onClick={run(() => store().interrupt(false))} />
          <Row icon={<OctagonX className="size-5" />} label="Interrupt all sessions" hint="Also stops generations started from other devices and the desktop page." danger onClick={run(() => store().interrupt(true))} />
          <Row icon={<Type className="size-5" />} label="Show prompt tokenization" hint="See how the prompt is split up and counted." onClick={tokenize} />
        </ul>
      )}
      {tokenError && <p role="alert" className="mt-3 rounded-xl bg-danger/15 p-3 text-sm text-danger">{tokenError}</p>}
    </Sheet>
  )
}
