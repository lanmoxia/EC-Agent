<template>
  <div :class="cn('relative h-2 w-full overflow-hidden rounded-full bg-secondary', $attrs.class)" v-bind="{ ...$attrs, class: undefined }">
    <div
      class="h-full bg-primary transition-all duration-300 ease-in-out"
      :style="{ width: `${Math.min(100, Math.max(0, modelValue))}%` }"
    />
  </div>
</template>

<script setup>
import { cn } from "./cn";
defineOptions({ inheritAttrs: false });
defineProps({ modelValue: { type: Number, default: 0 } });
</script>
