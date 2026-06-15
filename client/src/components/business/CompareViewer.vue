<template>
  <div class="space-y-4">

    <!-- 进行中状态 -->
    <div
      v-if="analyzing || reoptimizing"
      class="flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-4"
    >
      <Loader2 class="h-4 w-4 animate-spin text-primary shrink-0" />
      <p class="text-sm text-muted-foreground">
        {{ analyzing ? '正在对比两份分析报告，识别差异…' : '正在重新生成提示词…' }}
      </p>
    </div>

    <!-- 系统差异分析 -->
    <div
      v-if="failureAnalysis"
      class="rounded-xl border border-amber-500/25 bg-amber-500/8 p-5 space-y-2"
    >
      <h3 class="text-xs font-semibold uppercase tracking-wider text-amber-400/80">系统差异分析</h3>
      <div class="text-sm leading-relaxed whitespace-pre-wrap text-amber-200/90">{{ failureAnalysis }}</div>
    </div>

    <!-- 报错 -->
    <p v-if="analyzeError || reoptimizeError" class="text-sm text-destructive px-1">
      {{ analyzeError || reoptimizeError }}
    </p>

  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { Loader2 } from "lucide-vue-next";
import { reportsApi } from "@/api/reports.api";

const props = defineProps({
  originalReport:   { type: Object, required: true },
  comparisonReport: { type: Object, required: true },
});

const emit = defineEmits(["prompt-updated"]);

const analyzing       = ref(false);
const failureAnalysis = ref("");
const analyzeError    = ref(null);
const reoptimizing    = ref(false);
const reoptimizeError = ref(null);

onMounted(async () => {
  // 已有缓存（上次跑过的差异存在 comparison report 的 human_summary 里）→ 直接用
  const cached = props.comparisonReport.human_summary;
  if (cached) {
    failureAnalysis.value = cached;
    return; // 已处理过，提示词也已更新，不重跑
  }

  // Step 1: 对比差异
  analyzing.value = true;
  analyzeError.value = null;
  try {
    const res = await reportsApi.compareAnalyze(props.originalReport.id, {
      comparisonReport:   props.comparisonReport.ai_report,
      comparisonReportId: props.comparisonReport.id,
    });
    failureAnalysis.value = res.data?.failureAnalysis || "";
  } catch (err) {
    analyzeError.value = err.message || "差异分析失败";
    analyzing.value = false;
    return;
  }
  analyzing.value = false;

  // Step 2: 自动生成新提示词，更新到原报告，emit 通知父组件刷新豆包 tab
  reoptimizing.value = true;
  reoptimizeError.value = null;
  try {
    const res = await reportsApi.reoptimize(props.originalReport.id, {
      failureAnalysis: failureAnalysis.value,
      userFeedback:    "",
    });
    const newPrompt = res.data?.doubao_prompt;
    if (newPrompt) emit("prompt-updated", newPrompt);
  } catch (err) {
    reoptimizeError.value = err.message || "提示词生成失败，请刷新重试";
  } finally {
    reoptimizing.value = false;
  }
});
</script>
