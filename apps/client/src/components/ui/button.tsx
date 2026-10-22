import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-transparent text-sm font-medium whitespace-nowrap transition-[background-color,border-color,color,transform] duration-150 ease-editorial outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-px disabled:pointer-events-none disabled:opacity-45 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/85',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/88 focus-visible:ring-destructive',
        outline: 'border-input bg-card text-foreground hover:border-foreground',
        secondary: 'bg-muted text-foreground hover:bg-foreground/10',
        ghost: 'text-foreground hover:bg-muted',
        link: 'h-auto rounded-none px-0 text-foreground underline decoration-input underline-offset-4 hover:decoration-foreground',
      },
      size: {
        /* 44px default touch target; sm stays compact for dense admin rows. */
        default: 'h-11 px-5 text-[0.9375rem] has-[>svg]:px-4',
        xs: "h-7 gap-1 px-2.5 text-xs has-[>svg]:px-2 [&_svg:not([class*='size-'])]:size-3",
        sm: 'h-9 gap-1.5 px-3.5 text-[0.8125rem] has-[>svg]:px-3',
        lg: 'h-12 px-7 text-base has-[>svg]:px-6',
        icon: 'size-11',
        'icon-xs': "size-7 [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-9',
        'icon-lg': 'size-12',
      },
    },
    compoundVariants: [{ variant: 'link', className: 'h-auto px-0 has-[>svg]:px-0' }],
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : 'button';

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
