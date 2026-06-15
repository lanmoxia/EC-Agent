<template>
  <div :class="cn('rounded-xl border border-border bg-card text-card-foreground shadow-sm', $attrs.class)" v-bind="{ ...$attrs, class: undefined }">
    <slot />
  </div>
</template>
<script setup>
import { cn } from "./cn";
defineOptions({ inheritAttrs: false });
</script>
