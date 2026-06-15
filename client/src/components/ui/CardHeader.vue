<template>
  <div :class="cn('flex flex-col space-y-1.5 p-6', $attrs.class)" v-bind="{ ...$attrs, class: undefined }">
    <slot />
  </div>
</template>
<script setup>
import { cn } from "./cn";
defineOptions({ inheritAttrs: false });
</script>
