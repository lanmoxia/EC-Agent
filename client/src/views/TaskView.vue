<template>
  <div class="mx-auto max-w-3xl space-y-6 animate-fade-in">
    <!-- 返回 -->
    <router-link
      to="/"
      class="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
    >
      <ArrowLeft class="h-4 w-4" /> 返回上传
    </router-link>

    <!-- 任务信息头 -->
    <div v-if="task" class="flex items-start justify-between gap-4">
      <div class="space-y-1 min-w-0">
        <h1 class="text-xl font-bold truncate">{{ task.video_name }}</h1>
        <p class="text-sm text-muted-foreground">{{ formatTime(task.created_at) }}</p>
      </div>
      <Badge :variant="statusVariant" class="shrink-0 mt-1">{{ statusLabel }}</Badge>
    </div>

    <!-- 进度区域（分析中） -->
    <div
      v-if="task && ['pending', 'processing'].includes(task.status)"
      class="rounded-xl border border-border bg-card p-6 space-y-4"
    >
      <div class="flex items-center gap-3">
        <Loader2 class="h-5 w-5 text-primary animate-spin shrink-0" />
        <p class="text-sm font-medium">正在分析中，请稍候…</p>
      </div>
      <div
        ref="logContainer"
        class="rounded-lg bg-background border border-border p-4 h-40 overflow-y-auto font-mono text-xs space-y-1"
      >
        <p v-for="(msg, i) in progressLog" :key="i" class="text-muted-foreground leading-relaxed">
          <span class="text-primary/60 mr-2 select-none">›</span>{{ msg }}
        </p>
        <p class="text-primary animate-pulse">
          <span class="select-none">›</span>
          <span class="inline-block w-1.5 h-3 bg-primary ml-1 align-middle" />
        </p>
      </div>
    </div>

    <!-- 失败状态 -->
    <div
      v-if="task?.status === 'failed'"
      class="rounded-xl border border-destructive/30 bg-destructive/10 px-6 py-5 space-y-2"
    >
      <div class="flex items-center gap-2 text-destructive">
        <AlertCircle class="h-5 w-5" />
        <p class="font-medium">分析失败</p>
      </div>
      <p v-if="task.error_msg" class="text-sm text-destructive/80 font-mono">{{ task.error_msg }}</p>
      <router-link to="/" class="inline-flex items-center gap-1.5 text-sm text-destructive hover:underline mt-2">
        重新上传
      </router-link>
    </div>

    <!-- 报告展示（完成后） -->
    <div v-if="report" class="space-y-4 animate-fade-in">
      <Separator />
      <h2 class="text-base font-semibold">分析报告</h2>
      <ReportViewer :report="report" :override-prompt="overridePrompt" />
    </div>

    <!-- 对比分析区域 -->
    <template v-if="report">
      <Separator />
      <div class="space-y-4">
        <h2 class="text-base font-semibold">生成视频对比</h2>

        <!-- 未上传生成视频 -->
        <CompareUploader
          v-if="!comparisonTask"
          :parent-id="taskId"
          @submitted="onCompareSubmitted"
        />

        <!-- 对比任务分析中 -->
        <div
          v-else-if="['pending', 'processing'].includes(comparisonTask.status)"
          class="rounded-xl border border-border bg-card p-6 space-y-4"
        >
          <div class="flex items-center gap-3">
            <Loader2 class="h-5 w-5 text-primary animate-spin shrink-0" />
            <p class="text-sm font-medium">正在分析生成视频…</p>
          </div>
          <div class="rounded-lg bg-background border border-border p-4 h-32 overflow-y-auto font-mono text-xs space-y-1">
            <p v-for="(msg, i) in comparisonLog" :key="i" class="text-muted-foreground leading-relaxed">
              <span class="text-primary/60 mr-2 select-none">›</span>{{ msg }}
            </p>
          </div>
        </div>

        <!-- 对比完成 -->
        <CompareViewer
          v-else-if="comparisonTask?.status === 'done' && comparisonReport"
          :original-report="report"
          :comparison-report="comparisonReport"
          @prompt-updated="onPromptUpdated"
        />

        <!-- 对比分析失败 -->
        <div
          v-else-if="comparisonTask?.status === 'failed'"
          class="rounded-xl border border-destructive/30 bg-destructive/10 px-5 py-4 text-sm text-destructive flex items-center gap-3"
        >
          <AlertCircle class="h-4 w-4 shrink-0" />
          生成视频分析失败，
          <button class="underline hover:no-underline" @click="comparisonTask = null">重新上传</button>
        </div>
      </div>
    </template>

    <!-- 加载中骨架 -->
    <div v-if="!task" class="space-y-4">
      <div class="h-8 w-48 rounded-lg bg-muted animate-pulse" />
      <div class="h-32 rounded-xl bg-muted animate-pulse" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from "vue";
import { useRoute } from "vue-router";
import { ArrowLeft, Loader2, AlertCircle } from "lucide-vue-next";
import Badge from "@/components/ui/Badge.vue";
import Separator from "@/components/ui/Separator.vue";
import ReportViewer from "@/components/business/ReportViewer.vue";
import CompareUploader from "@/components/business/CompareUploader.vue";
import CompareViewer from "@/components/business/CompareViewer.vue";
import { useSSE } from "@/composables/useSSE";
import { tasksApi } from "@/api/tasks.api";
import { reportsApi } from "@/api/reports.api";

const route = useRoute();
const taskId = route.params.id;

const task           = ref(null);
const report         = ref(null);
const progressLog    = ref([]);
const logContainer   = ref(null);
const overridePrompt = ref(null); // CompareViewer 更新提示词后同步到 ReportViewer

// 对比任务状态
const comparisonTask   = ref(null);
const comparisonReport = ref(null);
const comparisonLog    = ref([]);
let   comparisonSource = null;

const STATUS_MAP = {
  pending:    { label: "等待中",  variant: "secondary" },
  processing: { label: "分析中",  variant: "warning" },
  done:       { label: "已完成",  variant: "success" },
  failed:     { label: "失败",    variant: "destructive" },
};
const statusLabel   = computed(() => STATUS_MAP[task.value?.status]?.label || task.value?.status || "");
const statusVariant = computed(() => STATUS_MAP[task.value?.status]?.variant || "secondary");

function formatTime(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")} ` +
         `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

async function scrollLog() {
  await nextTick();
  if (logContainer.value) logContainer.value.scrollTop = logContainer.value.scrollHeight;
}

// SSE 订阅（原始任务）
const { connect } = useSSE(taskId, {
  progress({ message }) {
    progressLog.value.push(message);
    scrollLog();
  },
  async done({ reportId }) {
    task.value = { ...task.value, status: "done" };
    try {
      const res = await reportsApi.getById(reportId);
      report.value = res.data;
    } catch {}
  },
  error({ message }) {
    task.value = { ...task.value, status: "failed", error_msg: message };
    progressLog.value.push(`错误: ${message}`);
    scrollLog();
  },
});

// 对比任务 SSE（动态任务ID，手动管理 EventSource）
function connectComparison(cTaskId) {
  if (comparisonSource) return;
  comparisonSource = new EventSource(`/api/sse/${cTaskId}`);

  comparisonSource.addEventListener("progress", (e) => {
    try { comparisonLog.value.push(JSON.parse(e.data).message); } catch {}
  });

  comparisonSource.addEventListener("done", async () => {
    comparisonSource.close();
    comparisonSource = null;
    comparisonTask.value = { ...comparisonTask.value, status: "done" };
    try {
      const res = await reportsApi.getByTaskId(cTaskId);
      comparisonReport.value = res.data;
    } catch {}
  });

  comparisonSource.addEventListener("error", () => {
    comparisonSource.close();
    comparisonSource = null;
    comparisonTask.value = { ...comparisonTask.value, status: "failed" };
  });
}

function onPromptUpdated(newPrompt) {
  overridePrompt.value = newPrompt;
}

function onCompareSubmitted(cTask) {
  comparisonTask.value = cTask;
  connectComparison(cTask.id);
}

async function fetchReport() {
  try {
    const res = await reportsApi.getByTaskId(taskId);
    report.value = res.data;
  } catch {}
}

onMounted(async () => {
  try {
    const res = await tasksApi.getById(taskId);
    task.value = res.data;

    if (task.value.status === "done") {
      await fetchReport();
      // 检查是否已有对比任务
      try {
        const compRes = await tasksApi.getComparison(taskId);
        const cTask = compRes.data;
        comparisonTask.value = cTask;
        if (cTask.status === "done") {
          const rRes = await reportsApi.getByTaskId(cTask.id);
          comparisonReport.value = rRes.data;
        } else if (["pending", "processing"].includes(cTask.status)) {
          connectComparison(cTask.id);
        }
      } catch {} // 404 = 暂无对比任务，正常
    } else if (["pending", "processing"].includes(task.value.status)) {
      connect();
    }
  } catch {}
});

onUnmounted(() => {
  comparisonSource?.close();
});
</script>
