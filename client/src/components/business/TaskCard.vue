<template>
  <router-link :to="`/tasks/${task.id}`" class="block group">
    <div class="flex items-center gap-4 rounded-lg border border-border bg-card px-5 py-4 transition-colors hover:border-primary/40 hover:bg-accent/20">
      <!-- 图标 -->
      <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
        <Video class="h-5 w-5 text-primary" />
      </div>

      <!-- 信息 -->
      <div class="flex-1 min-w-0">
        <p class="truncate text-sm font-medium text-foreground group-hover:text-primary transition-colors">
          {{ task.video_name }}
        </p>
        <p class="mt-0.5 text-xs text-muted-foreground">
          {{ formatTime(task.created_at) }}
        </p>
      </div>

      <!-- 状态 -->
      <Badge :variant="statusVariant">{{ statusLabel }}</Badge>

      <ChevronRight class="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
    </div>
  </router-link>
</template>

<script setup>
import { computed } from "vue";
import { Video, ChevronRight } from "lucide-vue-next";
import Badge from "@/components/ui/Badge.vue";

const props = defineProps({
  task: { type: Object, required: true },
});

const STATUS_MAP = {
  pending:    { label: "等待中",  variant: "secondary" },
  processing: { label: "分析中",  variant: "warning" },
  done:       { label: "已完成",  variant: "success" },
  failed:     { label: "失败",    variant: "destructive" },
};

const statusLabel   = computed(() => STATUS_MAP[props.task.status]?.label || props.task.status);
const statusVariant = computed(() => STATUS_MAP[props.task.status]?.variant || "secondary");

function formatTime(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")} ` +
         `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}
</script>
