import type { ReactNode } from 'react'
import { Drawer } from 'vaul'
import { cn } from '@/lib/utils'

type SheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** Optional element shown at the right of the title row. */
  action?: ReactNode
  /** `full` takes nearly the whole screen (for pickers with long lists); `auto` fits its content. */
  size?: 'auto' | 'full'
  children: ReactNode
}

/** Bottom sheet that slides up and can be dragged down to dismiss. */
export function Sheet({ open, onOpenChange, title, action, size = 'auto', children }: SheetProps) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} repositionInputs={false}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <Drawer.Content
          aria-describedby={undefined}
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-3xl bg-surface outline-none',
            size == 'full' ? 'h-[92dvh]' : 'max-h-[92dvh]',
          )}
        >
          <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-line" />
          <div className="flex min-h-12 shrink-0 items-center justify-between px-5 pt-1">
            <Drawer.Title className="text-lg font-semibold">{title}</Drawer.Title>
            {action}
          </div>
          <div className="pb-safe min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-2">{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
