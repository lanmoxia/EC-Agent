<template>
  <span :class="cn(badgeVariants({ variant }), $attrs.class)" v-bind="{ ...$attrs, class: undefined }">
    <slot />
  </span>
</template>

<script setup>
import { cn } from "./cn";
import { cva } from "class-variance-authority";

defineOptions({ inheritAttrs: false });
defineProps({ variant: { type: String, default: "default" } });

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-destructive text-destructive-foreground",
        outline: "text-foreground",
        success: "border-transparent bg-emerald-500/20 text-emerald-400",
        warning: "border-transparent bg-amber-500/20 text-amber-400",
      },
    },
    defaultVariants: { variant: "default" },
  }
);
</script>
