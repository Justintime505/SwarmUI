import * as SliderPrimitive from '@radix-ui/react-slider'
import { cn } from '@/lib/utils'

type SliderProps = {
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  label: string
  className?: string
}

/** Single-value slider with a large thumb for touch. */
export function Slider({ value, min, max, step, onChange, label, className }: SliderProps) {
  return (
    <SliderPrimitive.Root
      className={cn('relative flex h-11 w-full touch-none items-center select-none', className)}
      value={[value]}
      min={min}
      max={max}
      step={step}
      onValueChange={(v) => onChange(v[0])}
    >
      <SliderPrimitive.Track className="relative h-1.5 grow rounded-full bg-line">
        <SliderPrimitive.Range className="absolute h-full rounded-full bg-accent" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        aria-label={label}
        className="block size-6 rounded-full bg-fg shadow-md outline-none focus-visible:ring-4 focus-visible:ring-accent/40"
      />
    </SliderPrimitive.Root>
  )
}
