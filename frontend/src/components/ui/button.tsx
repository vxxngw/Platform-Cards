import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-display text-[13px] font-semibold tracking-[0.08em] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-45 disabled:saturate-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Royal gold: gradient leaf with an engraved edge
        default:
          "border border-gold-deep bg-[linear-gradient(180deg,#f6dc95_0%,#d6ab52_48%,#a47a2c_100%)] text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,.45),0_8px_22px_-10px_rgba(214,171,82,.7)] hover:brightness-110 active:brightness-95",
        destructive:
          "border border-[#5e1220] bg-[linear-gradient(180deg,#d4515b_0%,#a32a37_55%,#6e1424_100%)] text-destructive-foreground shadow-[inset_0_1px_0_rgba(255,255,255,.25)] hover:brightness-110",
        outline:
          "border border-gold/45 bg-night/60 text-ivory hover:border-gold/80 hover:bg-gold/10 hover:text-gold-bright",
        secondary:
          "border border-[#4b3a7a] bg-secondary text-secondary-foreground hover:bg-[#35285a]",
        ghost: "text-fg-subtle hover:bg-gold/10 hover:text-gold-bright",
        link: "text-gold underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-8 rounded-md px-3 text-[11px]",
        lg: "h-12 rounded-md px-8 text-sm",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
