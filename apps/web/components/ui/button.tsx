import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
const buttonVariants = cva("inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lime-300 disabled:cursor-not-allowed disabled:opacity-50", {
  variants: { variant: { default: "bg-lime-300 text-neutral-950 hover:bg-lime-200", outline: "border border-neutral-700 bg-neutral-900 text-neutral-100 hover:bg-neutral-800", ghost: "text-neutral-300 hover:bg-neutral-800" } }, defaultVariants: { variant: "default" }
});
export function Button({ className, variant, asChild = false, ...props }: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant }), className)} {...props} />;
}