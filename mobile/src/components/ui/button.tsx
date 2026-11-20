import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-xl font-medium select-none transition-[background-color,opacity,transform] active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-accent',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-fg active:bg-accent/85',
        secondary: 'bg-raised text-fg active:bg-line',
        ghost: 'text-fg active:bg-raised',
        danger: 'bg-danger/15 text-danger active:bg-danger/25',
      },
      size: {
        // Every size keeps at least a 44px touch target.
        md: 'min-h-11 px-4 text-[15px]',
        lg: 'min-h-13 px-5 text-base',
        icon: 'size-11 shrink-0',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
)

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>

/** Standard touch-sized button. */
export function Button({ className, variant, size, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
}
