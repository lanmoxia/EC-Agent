<template>
  <div class="space-y-6 animate-fade-in">
    <!-- 页头 -->
    <div class="flex items-center justify-between">
      <div class="space-y-1">
        <h1 class="text-2xl font-bold tracking-tight">历史记录</h1>
        <p class="text-sm text-muted-foreground">
          {{ activeTab === 'tasks' ? `共 ${total} 条任务` : `最近 ${reviews.length} 条评审` }}
        </p>
      </div>
      <div class="flex gap-2">
        <Button v-if="activeTab === 'tasks'" size="sm" variant="outline" :disabled="exporting" @click="exportFeedback">
          <Download class="h-4 w-4 mr-1.5" />
          {{ exporting ? '导出中…' : '导出反馈' }}
        </Button>
        <router-link to="/">
          <Button size="sm">
            <Plus class="h-4 w-4 mr-1.5" /> 新建分析
          </Button>
        </router-link>
      </div>
    </div>

    <!-- Tab 切换 -->
    <div class="flex gap-1 rounded-lg bg-muted p-1 w-fit">
      <button
        v-for="tab in tabs" :key="tab.key"
        class="rounded-md px-4 py-1.5 text-sm font-medium transition-all"
        :class="activeTab === tab.key
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground'"
        @click="activeTab = tab.key"
      >{{ tab.label }}</button>
    </div>

    <!-- ── 任务列表 ── -->
    <template v-if="activeTab === 'tasks'">
      <div v-if="loading" class="space-y-3">
        <div v-for="i in 5" :key="i" class="h-16 rounded-lg bg-muted animate-pulse" />
      </div>
      <div v-else-if="tasks.length" class="space-y-2">
        <TaskCard v-for="task in tasks" :key="task.id" :task="task" />
      </div>
      <div v-else class="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20 gap-4">
        <div class="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <FileVideo class="h-7 w-7 text-muted-foreground" />
        </div>
        <p class="text-sm text-muted-foreground">还没有分析记录</p>
        <router-link to="/"><Button variant="outline" size="sm">上传第一个视频</Button></router-link>
      </div>
      <div v-if="totalPages > 1" class="flex items-center justify-center gap-2 pt-4">
        <button
          class="flex h-8 w-8 items-center justify-center rounded-md border border-border text-sm text-muted-foreground hover:bg-accent disabled:opacity-40 disabled:pointer-events-none transition-colors"
          :disabled="page <= 1" @click="page--"
        ><ChevronLeft class="h-4 w-4" /></button>
        <span class="text-sm text-muted-foreground px-2">{{ page }} / {{ totalPages }}</span>
        <button
          class="flex h-8 w-8 items-center justify-center rounded-md border border-border text-sm text-muted-foreground hover:bg-accent disabled:opacity-40 disabled:pointer-events-none transition-colors"
          :disabled="page >= totalPages" @click="page++"
        ><ChevronRight class="h-4 w-4" /></button>
      </div>
    </template>

    <!-- ── 评审记录 ── -->
    <template v-else>
      <div v-if="loadingReviews" class="space-y-3">
        <div v-for="i in 5" :key="i" class="h-20 rounded-lg bg-muted animate-pulse" />
      </div>
      <div v-else-if="reviews.length" class="space-y-3">
        <div
          v-for="r in reviews" :key="r.id"
          class="rounded-xl border border-border bg-card p-4 space-y-2"
        >
          <div class="flex items-center gap-2 flex-wrap">
            <span class="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">{{ r.strategy || '未知策略' }}</span>
            <span class="text-xs text-muted-foreground">{{ r.video_name || r.report_id }}</span>
            <span class="ml-auto text-xs text-muted-foreground">{{ new Date(r.created_at).toLocaleString('zh-CN') }}</span>
          </div>
          <p v-if="r.prompt_text" class="text-xs text-muted-foreground/70 line-clamp-2 border-l-2 border-border pl-2">{{ r.prompt_text }}</p>
          <p class="text-sm text-foreground leading-relaxed">{{ r.review_text }}</p>
        </div>
      </div>
      <div v-else class="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20 gap-3">
        <p class="text-sm text-muted-foreground">还没有评审记录</p>
        <p class="text-xs text-muted-foreground/60">在任务详情的豆包提示词 Tab 填写评审意见后会显示在这里</p>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from "vue";
import { Plus, ChevronLeft, ChevronRight, FileVideo, Download } from "lucide-vue-next";
import Button from "@/components/ui/Button.vue";
import TaskCard from "@/components/business/TaskCard.vue";
import { tasksApi } from "@/api/tasks.api";
import { reportsApi } from "@/api/reports.api";

const tabs = [
  { key: "tasks",   label: "任务记录" },
  { key: "reviews", label: "评审记录" },
];
const activeTab = ref("tasks");

// ── 任务列表 ──────────────────────────────────────────────────────
const tasks      = ref([]);
const loading    = ref(false);
const exporting  = ref(false);
const page       = ref(1);
const total      = ref(0);
const totalPages = ref(1);
const limit      = 20;

async function fetchTasks() {
  loading.value = true;
  try {
    const res = await tasksApi.list({ page: page.value, limit });
    tasks.value      = res.data        || [];
    total.value      = res.total       || 0;
    totalPages.value = res.totalPages  || 1;
  } catch {
  } finally {
    loading.value = false;
  }
}

async function exportFeedback() {
  exporting.value = true;
  try {
    const data = await reportsApi.exportFeedback();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `feedback_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert("导出失败：" + err.message);
  } finally {
    exporting.value = false;
  }
}

// ── 评审记录 ──────────────────────────────────────────────────────
const reviews       = ref([]);
const loadingReviews = ref(false);

async function fetchReviews() {
  loadingReviews.value = true;
  try {
    const res  = await reportsApi.getRecentReviews(50);
    reviews.value = res.data || [];
  } catch {
  } finally {
    loadingReviews.value = false;
  }
}

watch(page, fetchTasks);
watch(activeTab, (tab) => { if (tab === "reviews") fetchReviews(); });
onMounted(fetchTasks);
</script>
