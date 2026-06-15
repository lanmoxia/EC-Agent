<template>
  <div>

    <!-- ── Tab 切换 ─────────────────────────────────────────────── -->
    <div class="flex gap-1 rounded-lg bg-muted p-1 w-fit">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="rounded-md px-4 py-1.5 text-sm font-medium transition-all"
        :class="activeTab === tab.key
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground'"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- ── AI 完整报告 ──────────────────────────────────────────── -->
    <div v-if="activeTab === 'ai'" class="mt-4 animate-fade-in">
      <div class="rounded-xl border border-border bg-card p-6">
        <div class="mb-4 flex items-center justify-between">
          <h3 class="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            AI 分析报告（供模型使用）
          </h3>
          <div class="flex items-center gap-2">
            <template v-if="!editingAiReport">
              <button
                class="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                @click="startEditAi"
              >
                <Pencil class="h-3.5 w-3.5" />
                编辑
              </button>
              <button
                class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                @click="copy(aiReportText, 'ai')"
              >
                <component :is="copied === 'ai' ? CheckCheck : Copy" class="h-3.5 w-3.5" />
                {{ copied === 'ai' ? '已复制' : '复制' }}
              </button>
            </template>
            <template v-else>
              <button
                class="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent"
                @click="cancelEditAi"
              >
                取消
              </button>
              <button
                class="flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs text-primary transition-colors hover:bg-primary/20 disabled:opacity-40"
                :disabled="savingAiReport"
                @click="saveAiReport"
              >
                {{ savingAiReport ? '保存中…' : '保存' }}
              </button>
            </template>
          </div>
        </div>
        <textarea
          v-if="editingAiReport"
          v-model="aiReportBuffer"
          rows="20"
          class="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring resize-none font-mono"
        />
        <div
          v-else
          class="report-body max-h-[600px] overflow-auto text-sm leading-relaxed text-foreground"
          v-html="renderReport(aiReportText)"
        />
        <p v-if="saveAiError" class="mt-2 text-xs text-destructive">{{ saveAiError }}</p>
      </div>
    </div>

    <!-- ── 人看版摘要 ──────────────────────────────────────────── -->
    <div v-if="activeTab === 'human'" class="mt-4 animate-fade-in">
      <div class="rounded-xl border border-border bg-card p-6">
        <div class="mb-4 flex items-center justify-between">
          <h3 class="text-sm font-semibold uppercase tracking-wider text-muted-foreground">人看版摘要</h3>
          <div class="flex items-center gap-2">
            <template v-if="!editingHuman">
              <button
                class="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                @click="startEditHuman"
              >
                <Pencil class="h-3.5 w-3.5" />
                编辑
              </button>
              <button
                class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                @click="copy(humanText, 'human')"
              >
                <component :is="copied === 'human' ? CheckCheck : Copy" class="h-3.5 w-3.5" />
                {{ copied === 'human' ? '已复制' : '复制' }}
              </button>
            </template>
            <template v-else>
              <button
                class="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent"
                @click="cancelEditHuman"
              >
                取消
              </button>
              <button
                class="flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs text-primary transition-colors hover:bg-primary/20 disabled:opacity-40"
                :disabled="savingHuman"
                @click="saveHuman"
              >
                {{ savingHuman ? '保存中…' : '保存' }}
              </button>
            </template>
          </div>
        </div>
        <textarea
          v-if="editingHuman"
          v-model="humanBuffer"
          rows="10"
          class="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring resize-none"
        />
        <pre
          v-else
          class="max-h-[600px] overflow-auto whitespace-pre-wrap text-sm leading-relaxed text-foreground"
        >{{ humanText || '暂无' }}</pre>
        <p v-if="saveHumanError" class="mt-2 text-xs text-destructive">{{ saveHumanError }}</p>
      </div>
    </div>

    <!-- ── 豆包提示词 ──────────────────────────────────────────── -->
    <div v-if="activeTab === 'prompt'" class="mt-4 animate-fade-in space-y-3">

      <!-- 多版本卡片（3版并行生成时） -->
      <template v-if="promptVersions.length > 0">
        <div
          v-for="(v, i) in promptVersions"
          :key="i"
          class="rounded-xl border bg-card p-5 space-y-3 transition-all duration-200"
          :class="adoptedIndex === i
            ? 'border-emerald-500/60 ring-1 ring-emerald-500/30'
            : 'border-border'"
        >
          <!-- 版本头 -->
          <div class="flex items-center justify-between gap-3 flex-wrap">
            <div class="flex items-center gap-2">
              <span class="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">{{ v.strategy }}</span>
              <span v-if="adoptedIndex === i" class="flex items-center gap-1 text-xs font-medium text-emerald-400">
                <CheckCheck class="h-3 w-3" /> 已采用
              </span>
            </div>
            <!-- 操作按钮：复制 | 采用 | 一般 | 太差 -->
            <div class="flex items-center gap-1.5">
              <button
                class="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                @click="copy(v.text, `v${i}`)"
              >
                <component :is="copied === `v${i}` ? CheckCheck : Copy" class="h-3 w-3" />
                {{ copied === `v${i}` ? '已复制' : '复制' }}
              </button>
              <button
                class="flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors"
                :class="adoptedIndex === i
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400 cursor-default'
                  : 'border-primary/30 bg-primary/5 text-primary hover:bg-primary/15'"
                :disabled="adoptedIndex === i || adoptingIndex === i"
                @click="openFeedbackModal(i, 'adopted', '采用', v.strategy)"
              >
                {{ adoptingIndex === i ? '采用中…' : adoptedIndex === i ? '已采用 ✓' : '采用' }}
              </button>
              <!-- 一般 -->
              <button
                class="flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors"
                :class="versionFeedback[i] === 'neutral'
                  ? 'border-amber-500/60 bg-amber-500 text-white cursor-default'
                  : versionFeedback[i]
                  ? 'border-border bg-muted/40 text-muted-foreground/40 cursor-default'
                  : 'border-amber-500/30 bg-amber-500/8 text-amber-400 hover:bg-amber-500/15'"
                :disabled="!!versionFeedback[i]"
                @click="openFeedbackModal(i, 'neutral', '一般', v.strategy)"
              >
                {{ versionFeedback[i] === 'neutral' ? '已标记' : '一般' }}
              </button>
              <!-- 太差 -->
              <button
                class="flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors"
                :class="versionFeedback[i] === 'bad'
                  ? 'border-red-500/60 bg-red-500 text-white cursor-default'
                  : versionFeedback[i]
                  ? 'border-border bg-muted/40 text-muted-foreground/40 cursor-default'
                  : 'border-red-400/30 bg-red-500/8 text-red-400 hover:bg-red-500/15'"
                :disabled="!!versionFeedback[i]"
                @click="openFeedbackModal(i, 'bad', '太差', v.strategy)"
              >
                <ThumbsDown class="h-3 w-3" />
                {{ versionFeedback[i] === 'bad' ? '已标记' : '太差' }}
              </button>
            </div>
          </div>
          <!-- 提示词正文 -->
          <p class="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{{ v.text }}</p>

          <!-- 预检结果 -->
          <div v-if="v.checks?.length" class="flex flex-wrap gap-1.5 pt-1 border-t border-border/50">
            <span
              v-for="(ck, ci) in v.checks"
              :key="ci"
              class="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
              :class="{
                'bg-amber-500/15 text-amber-400': ck.level === 'warn',
                'bg-emerald-500/15 text-emerald-400': ck.level === 'ok',
                'bg-sky-500/15 text-sky-400': ck.level === 'info',
              }"
            >
              <span v-if="ck.level === 'warn'">⚠</span>
              <span v-else-if="ck.level === 'ok'">✓</span>
              <span v-else>ℹ</span>
              {{ ck.msg }}
            </span>
          </div>

          <!-- 人工评审区 -->
          <div class="border-t border-border/50 pt-3 space-y-2">
            <p class="text-xs font-medium text-muted-foreground">评审意见（哪里不对、为什么）</p>
            <textarea
              v-model="reviewBuffers[i]"
              rows="3"
              placeholder="例：空间方向反了，路应该从左下往右上，提示词里写成从右往左了…"
              class="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm leading-relaxed placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
            <div class="flex items-center justify-between">
              <span v-if="reviewResults[i]" class="text-xs" :class="reviewResults[i].ok ? 'text-emerald-400' : 'text-destructive'">
                {{ reviewResults[i].msg }}
              </span>
              <span v-else class="text-xs text-muted-foreground/50">提交后自动记录到评审日志</span>
              <button
                class="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
                :disabled="!reviewBuffers[i]?.trim() || submittingReview[i]"
                @click="submitReview(i, v)"
              >
                {{ submittingReview[i] ? '提交中…' : '提交评审' }}
              </button>
            </div>
          </div>
        </div>

        <div class="flex items-center justify-between pt-1">
          <div class="flex items-center gap-2">
            <button
              class="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
              :disabled="regenerating"
              @click="regeneratePrompts"
            >
              <RefreshCw class="h-3.5 w-3.5" :class="regenerating && 'animate-spin'" />
              {{ regenerating ? '生成中…' : '重新生成提示词' }}
            </button>
            <span v-if="regenError" class="text-xs text-destructive">{{ regenError }}</span>
          </div>
          <button
            class="flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-400 transition-colors hover:bg-amber-500/20"
            @click="openDoubao"
          >
            <ExternalLink class="h-3.5 w-3.5" />
            打开豆包
          </button>
        </div>
      </template>

      <!-- 单版本模式（overridePrompt 注入 或 旧数据只有 doubao_prompt） -->
      <template v-else>
        <div class="rounded-xl border border-border bg-card p-6 space-y-4">
          <div class="flex items-center justify-between gap-4">
            <h3 class="text-sm font-semibold uppercase tracking-wider text-muted-foreground shrink-0">豆包提示词</h3>
            <div class="flex items-center gap-2">
              <template v-if="!editingPrompt">
                <button
                  class="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  @click="startEdit"
                >
                  <Pencil class="h-3.5 w-3.5" />
                  编辑
                </button>
                <button
                  class="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
                  :disabled="!promptText"
                  @click="copy(promptText, 'prompt')"
                >
                  <component :is="copied === 'prompt' ? CheckCheck : Copy" class="h-3.5 w-3.5" />
                  {{ copied === 'prompt' ? '已复制' : '复制' }}
                </button>
              </template>
              <template v-else>
                <button
                  class="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent"
                  @click="cancelEdit"
                >
                  取消
                </button>
                <button
                  class="flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs text-primary transition-colors hover:bg-primary/20 disabled:opacity-40"
                  :disabled="savingPrompt"
                  @click="savePrompt"
                >
                  {{ savingPrompt ? '保存中…' : '保存' }}
                </button>
              </template>
            </div>
          </div>

          <textarea
            v-if="editingPrompt"
            v-model="editBuffer"
            rows="8"
            class="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />
          <p
            v-else-if="promptText"
            class="whitespace-pre-wrap text-sm leading-relaxed text-foreground"
          >{{ promptText }}</p>
          <p v-else class="text-sm text-muted-foreground">暂无提示词</p>

          <p v-if="saveError" class="text-xs text-destructive">{{ saveError }}</p>

          <div v-if="!editingPrompt" class="flex items-center justify-end gap-2 border-t border-border pt-4">
            <button
              class="flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-400 transition-colors hover:bg-amber-500/20"
              @click="openDoubao"
            >
              <ExternalLink class="h-3.5 w-3.5" />
              打开豆包
            </button>
          </div>
        </div>
      </template>
    </div>

    <!-- ── 时间轴校验 ──────────────────────────────────────────── -->
    <div v-if="activeTab === 'validation'" class="mt-4 animate-fade-in">
      <div class="rounded-xl border border-border bg-card p-6 space-y-4">
        <h3 class="text-sm font-semibold uppercase tracking-wider text-muted-foreground">时间轴校验</h3>
        <template v-if="validation">
          <div class="flex items-center gap-2">
            <Badge :variant="validation.pass ? 'success' : 'destructive'">
              {{ validation.pass ? '✓ 通过' : '✗ 有错误' }}
            </Badge>
            <span v-if="validation.duration" class="text-xs text-muted-foreground">
              视频时长 {{ validation.duration.toFixed(1) }}s
            </span>
          </div>
          <div v-if="validation.issues?.length" class="space-y-1.5">
            <p class="text-xs font-medium text-destructive">错误（{{ validation.issues.length }} 项）</p>
            <div
              v-for="(issue, i) in validation.issues"
              :key="i"
              class="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              <span class="shrink-0">·</span>{{ issue }}
            </div>
            <div class="pt-1">
              <button
                class="flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs text-primary transition-colors hover:bg-primary/15"
                @click="goEditAiReport"
              >
                <Pencil class="h-3.5 w-3.5" />
                手动修正 AI 报告
              </button>
            </div>
          </div>
          <div v-if="validation.warnings?.length" class="space-y-1.5">
            <p class="text-xs font-medium text-amber-400">警告（{{ validation.warnings.length }} 项）</p>
            <div
              v-for="(warn, i) in validation.warnings"
              :key="i"
              class="flex items-start gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-400"
            >
              <span class="shrink-0">·</span>{{ warn }}
            </div>
            <!-- 警告说明 -->
            <p class="text-xs text-muted-foreground leading-relaxed pt-1">
              ⚠ 警告说明：Qwen 通过 AI 感知估算时间戳，精度约 ±0.5s，属正常误差。
              台词内容、动作描述、提示词均不受影响。只有时间戳略有偏移，不会导致分析结论错误。
            </p>
          </div>
          <p
            v-if="!validation.issues?.length && !validation.warnings?.length"
            class="text-sm text-emerald-400"
          >校验通过，未发现问题。</p>
        </template>
        <p v-else class="text-sm text-muted-foreground">暂无校验数据</p>
      </div>
    </div>

    <!-- ── 确认反馈弹窗 ──────────────────────────────────────────── -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="confirmModal.show"
          class="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" @click="confirmModal.show = false" />
          <div class="relative w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <p class="text-base font-semibold text-foreground mb-1">
              确认标记为「{{ confirmModal.label }}」？
            </p>
            <p class="text-sm text-muted-foreground mb-6">
              {{ confirmModal.strategy }} · 此反馈将记录用于经验积累
            </p>
            <div class="flex justify-end gap-3">
              <button
                class="rounded-lg border border-border px-5 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent"
                @click="confirmModal.show = false"
              >
                取消
              </button>
              <button
                class="rounded-lg px-5 py-2 text-sm font-medium text-white transition-colors"
                :class="confirmModal.rating === 'bad' ? 'bg-red-500 hover:bg-red-600' : confirmModal.rating === 'adopted' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-amber-500 hover:bg-amber-600'"
                @click="doFeedbackConfirm"
              >
                确认
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

  </div>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import { Copy, CheckCheck, ThumbsDown, ExternalLink, Pencil, RefreshCw } from "lucide-vue-next";
import Badge from "@/components/ui/Badge.vue";
import { reportsApi } from "@/api/reports.api";
import { tasksApi } from "@/api/tasks.api";

const props = defineProps({
  report:         { type: Object, required: true },
  overridePrompt: { type: String,  default: null },
});

const tabs = [
  { key: "ai",         label: "AI 报告" },
  { key: "human",      label: "人看摘要" },
  { key: "prompt",     label: "豆包提示词" },
  { key: "validation", label: "时间轴校验" },
];

const activeTab    = ref("ai");
const copied       = ref(null);

// 豆包提示词编辑状态（单版本模式用）
const promptText    = ref(props.overridePrompt || props.report.doubao_prompt || "");
const editingPrompt = ref(false);
const editBuffer    = ref("");
const savingPrompt  = ref(false);
const saveError     = ref(null);

// AI 报告编辑状态
const aiReportText    = ref(props.report.ai_report || "");
const editingAiReport = ref(false);
const aiReportBuffer  = ref("");
const savingAiReport  = ref(false);
const saveAiError     = ref(null);

// 人看摘要编辑状态
const humanText      = ref(props.report.human_summary || "");
const editingHuman   = ref(false);
const humanBuffer    = ref("");
const savingHuman    = ref(false);
const saveHumanError = ref(null);

// 多版本提示词（3版并行生成时）
const localVersions = ref(null); // 重新生成后覆盖 props 里的版本
const promptVersions = computed(() => {
  if (props.overridePrompt) return [];
  return localVersions.value ?? props.report.doubaoPromptsJson ?? [];
});
const adoptedIndex   = ref(null);
const adoptingIndex  = ref(null);
const regenerating   = ref(false);
const regenError     = ref(null);

// 人工评审状态（每个版本独立）
const reviewBuffers    = ref({});
const submittingReview = ref({});
const reviewResults    = ref({});

async function regeneratePrompts() {
  if (!props.report.task_id) return;
  regenerating.value = true;
  regenError.value = null;
  adoptedIndex.value = null;
  try {
    const res = await tasksApi.regeneratePrompts(props.report.task_id);
    localVersions.value = res.data?.doubaoPromptsJson ?? res.data?.doubao_prompts_json ?? null;
  } catch (err) {
    regenError.value = err.message || "重新生成失败，请重试";
  } finally {
    regenerating.value = false;
  }
}

const validation = computed(() =>
  props.report.validationJson || props.report.validation_json || null
);

// CompareViewer 更新提示词后同步到豆包 tab
watch(() => props.overridePrompt, (val) => {
  if (val) {
    promptText.value = val;
    activeTab.value = "prompt";
  }
});

// ── AI 报告 Markdown 渲染 ─────────────────────────────────────────

function escHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderReport(text) {
  if (!text) return "";
  return text.split("\n").map(line => {
    if (line.startsWith("## ")) {
      return `<p class="rh">${escHtml(line.slice(3))}</p>`;
    }
    if (line.trim() === "---") {
      return `<hr class="rhr">`;
    }
    if (line.trim() === "") {
      return `<p class="rbk"></p>`;
    }
    const content = escHtml(line).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    return `<p>${content}</p>`;
  }).join("");
}

// ── 通用工具 ─────────────────────────────────────────────────────

async function copy(text, key) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    copied.value = key;
    setTimeout(() => { copied.value = null; }, 2000);
  } catch {}
}

function openDoubao() {
  window.open("https://www.doubao.com/", "_blank", "noopener");
}

// ── 提示词编辑（单版本模式） ─────────────────────────────────────

function startEdit() {
  editBuffer.value = promptText.value;
  editingPrompt.value = true;
  saveError.value = null;
}

function cancelEdit() {
  editingPrompt.value = false;
  saveError.value = null;
}

async function savePrompt() {
  savingPrompt.value = true;
  saveError.value = null;
  try {
    await reportsApi.update(props.report.id, { doubao_prompt: editBuffer.value });
    promptText.value = editBuffer.value;
    editingPrompt.value = false;
  } catch (err) {
    saveError.value = err.message || "保存失败，请重试";
  } finally {
    savingPrompt.value = false;
  }
}

// ── AI 报告编辑 ───────────────────────────────────────────────────

function startEditAi() {
  aiReportBuffer.value = aiReportText.value;
  editingAiReport.value = true;
  saveAiError.value = null;
}

function cancelEditAi() {
  editingAiReport.value = false;
  saveAiError.value = null;
}

async function saveAiReport() {
  savingAiReport.value = true;
  saveAiError.value = null;
  try {
    await reportsApi.update(props.report.id, { ai_report: aiReportBuffer.value });
    aiReportText.value = aiReportBuffer.value;
    editingAiReport.value = false;
  } catch (err) {
    saveAiError.value = err.message || "保存失败，请重试";
  } finally {
    savingAiReport.value = false;
  }
}

// ── 人看摘要编辑 ──────────────────────────────────────────────────

function startEditHuman() {
  humanBuffer.value = humanText.value;
  editingHuman.value = true;
  saveHumanError.value = null;
}

function cancelEditHuman() {
  editingHuman.value = false;
  saveHumanError.value = null;
}

async function saveHuman() {
  savingHuman.value = true;
  saveHumanError.value = null;
  try {
    await reportsApi.update(props.report.id, { human_summary: humanBuffer.value });
    humanText.value = humanBuffer.value;
    editingHuman.value = false;
  } catch (err) {
    saveHumanError.value = err.message || "保存失败，请重试";
  } finally {
    savingHuman.value = false;
  }
}

// ── 校验 Tab → 跳到 AI 报告手动修正 ─────────────────────────────

function goEditAiReport() {
  activeTab.value = "ai";
  startEditAi();
}

// ── 人工评审提交 ──────────────────────────────────────────────────

async function submitReview(index, v) {
  const text = reviewBuffers.value[index]?.trim();
  if (!text) return;
  submittingReview.value = { ...submittingReview.value, [index]: true };
  reviewResults.value    = { ...reviewResults.value,    [index]: null };
  try {
    await reportsApi.submitReview(props.report.id, {
      strategy:   v.strategy,
      promptText: v.text,
      reviewText: text,
    });
    reviewBuffers.value = { ...reviewBuffers.value, [index]: "" };
    reviewResults.value = { ...reviewResults.value, [index]: { ok: true, msg: "✓ 已记录" } };
    setTimeout(() => {
      reviewResults.value = { ...reviewResults.value, [index]: null };
    }, 3000);
  } catch (err) {
    reviewResults.value = { ...reviewResults.value, [index]: { ok: false, msg: err.message || "提交失败" } };
  } finally {
    submittingReview.value = { ...submittingReview.value, [index]: false };
  }
}

// ── 每版本反馈 ────────────────────────────────────────────────────

const versionFeedback = ref({});
const confirmModal = ref({ show: false, index: null, rating: null, label: "", strategy: "" });

function openFeedbackModal(index, rating, label, strategy) {
  confirmModal.value = { show: true, index, rating, label, strategy };
}

async function doFeedbackConfirm() {
  const { index, rating, strategy } = confirmModal.value;
  confirmModal.value.show = false;

  if (rating === "adopted") {
    const v = promptVersions.value[index];
    if (!v) return;
    adoptingIndex.value = index;
    try {
      await reportsApi.adoptPrompt(props.report.id, { strategy: v.strategy, text: v.text, index });
      promptText.value = v.text;
      adoptedIndex.value = index;
    } catch (err) {
      console.error("采用失败", err);
    } finally {
      adoptingIndex.value = null;
    }
  } else {
    try {
      const v = promptVersions.value[index];
      await reportsApi.submitFeedback(props.report.id, {
        rating,
        strategy: strategy || null,
        comment: `[${strategy || `版本${(index ?? 0) + 1}`}] ${v?.text?.slice(0, 80) || ""}`,
      });
      versionFeedback.value = { ...versionFeedback.value, [index]: rating };
    } catch (err) {
      console.error("反馈提交失败", err);
    }
  }
}
</script>

<style scoped>
/* AI 报告 Markdown 渲染样式 */
.report-body :deep(.rh) {
  font-weight: 600;
  margin-top: 1.25rem;
  margin-bottom: 0.15rem;
}
.report-body :deep(.rh:first-child) {
  margin-top: 0;
}
.report-body :deep(hr.rhr) {
  border: none;
  border-top: 1px solid hsl(var(--border) / 0.5);
  margin: 0.75rem 0;
}
.report-body :deep(.rbk) {
  height: 0.4rem;
}
.report-body :deep(p) {
  margin-bottom: 0.05rem;
}
.report-body :deep(strong) {
  font-weight: 600;
}

/* 确认弹窗淡入淡出 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
