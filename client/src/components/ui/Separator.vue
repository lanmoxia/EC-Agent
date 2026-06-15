<template>
  <div
    :class="cn(
      'shrink-0 bg-border',
      orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
      $attrs.class
    )"
    v-bind="{ ...$attrs, class: undefined }"
  />
</template>

<script setup>
import { cn } from "./cn";
defineOptions({ inheritAttrs: false });
defineProps({ orientation: { type: String, default: "horizontal" } });
</script>
