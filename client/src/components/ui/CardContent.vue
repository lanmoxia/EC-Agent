<template>
  <div :class="cn('p-6 pt-0', $attrs.class)" v-bind="{ ...$attrs, class: undefined }">
    <slot />
  </div>
</template>
<script setup>
import { cn } from "./cn";
defineOptions({ inheritAttrs: false });
</script>
