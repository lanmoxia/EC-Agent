<template>
  <div class="mx-auto max-w-3xl space-y-8 animate-fade-in">
    <!-- 页头 -->
    <div class="space-y-2">
      <h1 class="text-2xl font-bold tracking-tight">上传视频分析</h1>
      <p class="text-muted-foreground text-sm">
        上传电商视频，Qwen 多模态模型输出结构化分析报告和生成平台提示词。
      </p>
    </div>

    <!-- 双入口卡片 -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <!-- 豆包 -->
      <div
        class="rounded-xl border border-border bg-card overflow-hidden cursor-pointer"
        :class="{ 'cursor-default': active === 'douban' }"
        @click="active !== 'douban' && toggle('douban')"
      >
        <div class="flex items-center justify-between px-5 py-4 hover:bg-muted/50 transition-colors"
          @click.stop="toggle('douban')"
        >
          <div class="flex items-center gap-3">
            <div class="h-9 w-9 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center shrink-0">
              <span class="text-lg">🎬</span>
            </div>
            <div class="text-left">
              <p class="font-semibold text-sm">豆包 Seedance</p>
              <p class="text-xs text-muted-foreground">≤10s · 免费生成</p>
            </div>
          </div>
          <ChevronDown
            class="h-4 w-4 text-muted-foreground transition-transform duration-200"
            :class="{ 'rotate-180': active === 'douban' }"
          />
        </div>
        <div v-show="active === 'douban'" class="border-t border-border px-4 pb-4 pt-3" @click.stop>
          <VideoUploader platform="douban" @uploaded="onUploaded" />
        </div>
      </div>

      <!-- 可灵 -->
      <div
        class="rounded-xl border border-border bg-card overflow-hidden cursor-pointer"
        :class="{ 'cursor-default': active === 'kling' }"
        @click="active !== 'kling' && toggle('kling')"
      >
        <div class="flex items-center justify-between px-5 py-4 hover:bg-muted/50 transition-colors"
          @click.stop="toggle('kling')"
        >
          <div class="flex items-center gap-3">
            <div class="h-9 w-9 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0">
              <span class="text-lg">🎥</span>
            </div>
            <div class="text-left">
              <p class="font-semibold text-sm">可灵</p>
              <p class="text-xs text-muted-foreground">>13s · 精准复刻</p>
            </div>
          </div>
          <ChevronDown
            class="h-4 w-4 text-muted-foreground transition-transform duration-200"
            :class="{ 'rotate-180': active === 'kling' }"
          />
        </div>
        <div v-show="active === 'kling'" class="border-t border-border px-4 pb-4 pt-3" @click.stop>
          <VideoUploader platform="kling" @uploaded="onUploaded" />
        </div>
      </div>
    </div>

    <!-- 最近任务 -->
    <div v-if="recentTasks.length" class="space-y-3">
      <h2 class="text-sm font-medium text-muted-foreground uppercase tracking-wider">最近任务</h2>
      <TaskCard v-for="task in recentTasks" :key="task.id" :task="task" />
      <router-link
        to="/history"
        class="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-3 text-sm text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
      >
        查看全部历史记录
        <ChevronRight class="h-3.5 w-3.5" />
      </router-link>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { ChevronRight, ChevronDown } from "lucide-vue-next";
import VideoUploader from "@/components/business/VideoUploader.vue";
import TaskCard from "@/components/business/TaskCard.vue";
import { tasksApi } from "@/api/tasks.api";

const router = useRouter();
const recentTasks = ref([]);
const active = ref("douban"); // 默认展开豆包

function toggle(platform) {
  active.value = active.value === platform ? null : platform;
}

onMounted(async () => {
  try {
    const res = await tasksApi.list({ limit: 3 });
    recentTasks.value = res.data || [];
  } catch {}
});

function onUploaded(task) {
  router.push(`/tasks/${task.id}`);
}
</script>
