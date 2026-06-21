<template>
  <div class="mx-auto max-w-3xl space-y-8 animate-fade-in">
    <!-- 页头 -->
    <div class="space-y-2">
      <h1 class="text-2xl font-bold tracking-tight">投喂成功提示词</h1>
      <p class="text-muted-foreground text-sm">
        把做成功的提示词喂回来沉淀。忙的时候只贴提示词就行，对标视频和生成视频可以以后在列表里补。
      </p>
    </div>

    <!-- ── 提交卡片 ─────────────────────────────────────────────── -->
    <div class="rounded-xl border border-border bg-card p-5 space-y-5">
      <!-- 平台 tab -->
      <div class="flex gap-1 rounded-lg bg-muted p-1 w-fit">
        <button
          v-for="p in PLATFORMS"
          :key="p.key"
          class="rounded-md px-4 py-1.5 text-sm font-medium transition-all"
          :class="platform === p.key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
          @click="platform = p.key"
        >
          {{ p.label }}
        </button>
      </div>

      <!-- 提示词输入 -->
      <div class="space-y-2">
        <label class="text-sm font-medium">提示词<span class="text-destructive">*</span></label>

        <!-- 豆包：单框 -->
        <textarea
          v-if="platform === 'douban'"
          v-model="doubanPrompt"
          rows="6"
          placeholder="粘贴你做成功的豆包提示词…"
          class="w-full resize-none rounded-lg border border-input bg-background px-3 py-2.5 text-sm leading-relaxed placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />

        <!-- 可灵：多分镜 -->
        <div v-else class="space-y-2">
          <div
            v-for="(shot, i) in klingShots"
            :key="i"
            class="rounded-lg border border-border bg-background/50 p-3 space-y-2"
          >
            <div class="flex items-center justify-between">
              <span class="rounded-full bg-sky-500/15 px-2.5 py-0.5 text-xs font-semibold text-sky-400">第 {{ i + 1 }} 镜</span>
              <button
                v-if="klingShots.length > 1"
                class="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                title="删除此分镜"
                @click="klingShots.splice(i, 1)"
              >
                <X class="h-4 w-4" />
              </button>
            </div>
            <textarea
              v-model="klingShots[i]"
              rows="3"
              :placeholder="`第 ${i + 1} 镜的提示词…`"
              class="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <button
            class="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors"
            @click="klingShots.push('')"
          >
            <Plus class="h-4 w-4" /> 添加分镜
          </button>
        </div>
      </div>

      <!-- 视频（可选，可折叠）：两 tab 对标/生成 -->
      <div class="rounded-lg border border-border overflow-hidden">
        <button class="flex w-full items-center justify-between px-4 py-3 text-left" @click="showVideos = !showVideos">
          <div class="flex items-center gap-2">
            <Clapperboard class="h-4 w-4 text-muted-foreground" />
            <span class="text-sm font-medium">对标视频 / 生成视频</span>
            <span class="text-xs text-muted-foreground">可选，可以以后补</span>
            <Badge v-if="targetVideo || generatedVideo" variant="secondary" class="ml-1 text-xs">
              {{ (targetVideo ? 1 : 0) + (generatedVideo ? 1 : 0) }}
            </Badge>
          </div>
          <ChevronDown class="h-4 w-4 text-muted-foreground transition-transform duration-200" :class="showVideos && 'rotate-180'" />
        </button>
        <div v-if="showVideos" class="border-t border-border p-4 space-y-3">
          <div class="flex gap-1 rounded-lg bg-muted p-1 w-fit">
            <button
              v-for="t in VIDEO_TABS"
              :key="t.key"
              class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all"
              :class="videoTab === t.key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
              @click="videoTab = t.key"
            >
              {{ t.label }}
              <Check v-if="(t.key === 'target' && targetVideo) || (t.key === 'generated' && generatedVideo)" class="h-3.5 w-3.5 text-emerald-400" />
            </button>
          </div>
          <VideoPicker v-show="videoTab === 'target'" v-model="targetVideo" placeholder="选择对标视频（你模仿的原视频）" />
          <VideoPicker v-show="videoTab === 'generated'" v-model="generatedVideo" placeholder="选择用该提示词生成的视频" />
        </div>
      </div>

      <!-- 备注（可选） -->
      <div class="space-y-2">
        <label class="text-sm font-medium text-muted-foreground">备注 <span class="text-xs">（可选）</span></label>
        <input
          v-model="note"
          placeholder="例：这条改了开场触发后效果很好"
          class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <!-- 错误 + 提交 -->
      <div v-if="error" class="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        <AlertCircle class="h-4 w-4 shrink-0" />{{ error }}
      </div>
      <Button :disabled="submitting || !canSubmit" class="w-full" size="lg" @click="submit">
        <Loader2 v-if="submitting" class="mr-2 h-4 w-4 animate-spin" />
        <Send v-else class="mr-2 h-4 w-4" />
        {{ submitting ? '提交中…' : '提交' }}
      </Button>
    </div>

    <!-- ── 投喂列表 ─────────────────────────────────────────────── -->
    <div class="space-y-3">
      <h2 class="text-sm font-medium text-muted-foreground uppercase tracking-wider">投喂记录</h2>
      <p v-if="!feedings.length" class="text-sm text-muted-foreground">还没有投喂记录。提交第一条吧。</p>
      <router-link
        v-for="f in feedings"
        :key="f.id"
        :to="`/feed/${f.id}`"
        class="block rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
      >
        <div class="flex items-center gap-2 mb-2">
          <Badge :variant="f.platform === 'kling' ? 'secondary' : 'default'">
            {{ f.platform === 'kling' ? '可灵' : '豆包' }}
          </Badge>
          <Badge :variant="f.status === 'complete' ? 'success' : 'warning'">
            {{ f.status === 'complete' ? '✓ 已完整' : '待补视频' }}
          </Badge>
          <span class="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <span :class="f.target_video_path ? 'text-emerald-400' : ''">对标{{ f.target_video_path ? '✓' : '—' }}</span>
            <span :class="f.generated_video_path ? 'text-emerald-400' : ''">生成{{ f.generated_video_path ? '✓' : '—' }}</span>
            <span>{{ fmtTime(f.created_at) }}</span>
          </span>
        </div>
        <p class="text-sm text-foreground line-clamp-2 whitespace-pre-wrap">{{ f.prompt_text }}</p>
      </router-link>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { X, Plus, Check, ChevronDown, Clapperboard, AlertCircle, Loader2, Send } from "lucide-vue-next";
import Button from "@/components/ui/Button.vue";
import Badge from "@/components/ui/Badge.vue";
import VideoPicker from "@/components/business/VideoPicker.vue";
import { feedingsApi } from "@/api/feedings.api";

const PLATFORMS = [
  { key: "douban", label: "豆包" },
  { key: "kling",  label: "可灵" },
];
const VIDEO_TABS = [
  { key: "target",    label: "对标视频" },
  { key: "generated", label: "生成视频" },
];

const platform     = ref("douban");
const doubanPrompt  = ref("");
const klingShots    = ref([""]);
const showVideos    = ref(false);
const videoTab      = ref("target");
const targetVideo    = ref(null);
const generatedVideo = ref(null);
const note          = ref("");
const submitting    = ref(false);
const error         = ref(null);
const feedings      = ref([]);

// 拍平可灵分镜为可读文本 + 结构化数组
function buildKling() {
  const shots = klingShots.value.map(s => s.trim()).filter(Boolean);
  const promptText = shots.map((t, i) => `【第${i + 1}镜】\n${t}`).join("\n\n");
  const promptJson = JSON.stringify(shots.map((t, i) => ({ index: i + 1, text: t })));
  return { promptText, promptJson, count: shots.length };
}

const canSubmit = computed(() => {
  if (platform.value === "douban") return !!doubanPrompt.value.trim();
  return klingShots.value.some(s => s.trim());
});

async function submit() {
  if (!canSubmit.value || submitting.value) return;
  error.value = null;

  const fd = new FormData();
  fd.append("platform", platform.value);
  if (platform.value === "kling") {
    const { promptText, promptJson } = buildKling();
    fd.append("promptText", promptText);
    fd.append("promptJson", promptJson);
  } else {
    fd.append("promptText", doubanPrompt.value.trim());
  }
  if (note.value.trim()) fd.append("note", note.value.trim());
  if (targetVideo.value)    fd.append("targetVideo", targetVideo.value);
  if (generatedVideo.value) fd.append("generatedVideo", generatedVideo.value);

  submitting.value = true;
  try {
    const res = await feedingsApi.create(fd);
    feedings.value.unshift(res.data);
    resetForm();
  } catch (err) {
    error.value = err.message || "提交失败，请重试";
  } finally {
    submitting.value = false;
  }
}

function resetForm() {
  doubanPrompt.value = "";
  klingShots.value = [""];
  targetVideo.value = null;
  generatedVideo.value = null;
  note.value = "";
  showVideos.value = false;
  videoTab.value = "target";
}

function fmtTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const p = n => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

onMounted(async () => {
  try {
    const res = await feedingsApi.list({ limit: 20 });
    feedings.value = res.data || [];
  } catch { /* 列表加载失败不阻塞提交 */ }
});
</script>
