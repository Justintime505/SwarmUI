import { ImageOff } from 'lucide-react'
import { useState } from 'react'
import { serverUrl } from '@/api/client'
import type { SwarmModel } from '@/api/models'
import { cn } from '@/lib/utils'

/** Square preview image for a model, with a placeholder when it has none or it fails to load. */
export function ModelThumb({ model, className }: { model: SwarmModel | undefined; className?: string }) {
  const [failed, setFailed] = useState(false)
  const src = model?.preview_image
  if (!src || failed) {
    return (
      <div className={cn('flex shrink-0 items-center justify-center rounded-lg bg-raised text-muted', className)}>
        <ImageOff className="size-1/2" strokeWidth={1.5} />
      </div>
    )
  }
  return (
    <img
      src={serverUrl(src)}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn('shrink-0 rounded-lg bg-raised object-cover', className)}
    />
  )
}
