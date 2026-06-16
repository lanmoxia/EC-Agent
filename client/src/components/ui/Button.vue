<template>
  <component
    :is="as"
    :class="cn(buttonVariants({ variant, size }), $attrs.class)"
    v-bind="{ ...$attrs, class: undefined }"
  >
    <slot />
  </component>
</template>

<script setup>
import { cn } from "./cn";
import { cva } from "class-variance-authority";

defineOptions({ inheritAttrs: false });

defineProps({
  variant: { type: String, default: "default" },
  size: { type: String, default: "default" },
  as: { type: [String, Object], default: "button" },
});

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);
</script>
