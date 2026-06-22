<template>
  <div class="mx-auto max-w-3xl space-y-6 animate-fade-in">
    <!-- 返回 -->
    <router-link to="/feed" class="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
      <ArrowLeft class="h-4 w-4" /> 返回投喂列表
    </router-link>

    <template v-if="feeding">
      <!-- 头 -->
      <div class="flex items-center gap-2">
        <Badge :variant="feeding.platform === 'kling' ? 'secondary' : 'default'">
          {{ feeding.platform === 'kling' ? '可灵' : '豆包' }}
        </Badge>
        <Badge :variant="feeding.status === 'complete' ? 'success' : 'warning'">
          {{ feeding.status === 'complete' ? '✓ 已完整' : '待补视频' }}
        </Badge>
        <span class="ml-auto text-xs text-muted-foreground">{{ fmtTime(feeding.created_at) }}</span>
      </div>

      <!-- 提示词（只读展示） -->
      <div class="rounded-xl border border-border bg-card p-5 space-y-3">
        <h3 class="text-sm font-semibold uppercase tracking-wider text-muted-foreground">提示词</h3>
        <!-- 可灵分镜 -->
        <template v-if="feeding.platform === 'kling' && feeding.promptJson?.length">
          <div v-for="shot in feeding.promptJson" :key="shot.index" class="rounded-lg border border-border bg-background/50 p-3 space-y-1.5">
            <span class="rounded-full bg-sky-500/15 px-2.5 py-0.5 text-xs font-semibold text-sky-400">第 {{ shot.index }} 镜</span>
            <p class="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{{ shot.text }}</p>
          </div>
        </template>
        <!-- 豆包整段 -->
        <p v-else class="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{{ feeding.prompt_text }}</p>
      </div>

      <!-- 补/换视频 -->
      <div class="rounded-xl border border-border bg-card p-5 space-y-4">
        <h3 class="text-sm font-semibold uppercase tracking-wider text-muted-foreground">对标视频 / 生成视频</h3>

        <!-- 豆包：单对标 + 单生成 -->
        <div v-if="feeding.platform !== 'kling'" class="space-y-4">
          <div class="space-y-1.5">
            <label class="text-sm font-medium">对标视频<span class="text-xs text-muted-foreground">（你模仿的原视频）</span></label>
            <VideoPicker v-model="newTarget" :existing-name="feeding.target_video_name || ''" placeholder="选择对标视频" />
          </div>
          <div class="space-y-1.5">
            <label class="text-sm font-medium">生成视频<span class="text-xs text-muted-foreground">（用该提示词生成的）</span></label>
            <VideoPicker v-model="newGenerated" :existing-name="feeding.generated_video_name || ''" placeholder="选择生成视频" />
          </div>
        </div>

        <!-- 可灵：整段对标 + 每镜(对标分段 + 生成视频) -->
        <div v-else class="space-y-4">
          <div class="space-y-1.5">
            <label class="text-sm font-medium">整段对标视频<span class="text-xs text-muted-foreground">（完整原视频，可选）</span></label>
            <VideoPicker v-model="newTarget" :existing-name="feeding.target_video_name || ''" placeholder="选择完整对标原视频" />
          </div>
          <div
            v-for="(shot, i) in (feeding.promptJson || [])"
            :key="i"
            class="rounded-lg border border-border bg-background/50 p-3 space-y-2.5"
          >
            <div class="flex items-center gap-2">
              <span class="shrink-0 rounded-full bg-sky-500/15 px-2.5 py-0.5 text-xs font-semibold text-sky-400">第 {{ i + 1 }} 镜</span>
              <span class="line-clamp-1 text-xs text-muted-foreground">{{ shot.text }}</span>
            </div>
            <div v-if="klingNew[i]" class="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div class="space-y-1">
                <span class="text-xs text-muted-foreground">对标分段</span>
                <VideoPicker v-model="klingNew[i].targetSeg" :existing-name="shot.targetSegment?.name || ''" :placeholder="`第${i + 1}镜 对标分段`" />
              </div>
              <div class="space-y-1">
                <span class="text-xs text-muted-foreground">生成视频</span>
                <VideoPicker v-model="klingNew[i].gen" :existing-name="shot.generated?.name || ''" :placeholder="`第${i + 1}镜 生成视频`" />
              </div>
            </div>
          </div>
        </div>

        <!-- 备注 -->
        <div class="space-y-1.5">
          <label class="text-sm font-medium text-muted-foreground">备注</label>
          <input
            v-model="note"
            placeholder="可选备注…"
            class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div v-if="error" class="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle class="h-4 w-4 shrink-0" />{{ error }}
        </div>
        <div class="flex items-center justify-end gap-3">
          <span v-if="savedMsg" class="text-xs text-emerald-400">{{ savedMsg }}</span>
          <Button :disabled="saving || !canSave" @click="save">
            <Loader2 v-if="saving" class="mr-2 h-4 w-4 animate-spin" />
            <Save v-else class="mr-2 h-4 w-4" />
            {{ saving ? '保存中…' : '保存' }}
          </Button>
        </div>
      </div>
    </template>

    <p v-else-if="loadError" class="text-sm text-destructive">{{ loadError }}</p>
    <p v-else class="text-sm text-muted-foreground">加载中…</p>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { useRoute } from "vue-router";
import { ArrowLeft, AlertCircle, Loader2, Save } from "lucide-vue-next";
import Button from "@/components/ui/Button.vue";
import Badge from "@/components/ui/Badge.vue";
import VideoPicker from "@/components/business/VideoPicker.vue";
import { feedingsApi } from "@/api/feedings.api";

const route = useRoute();
const feeding   = ref(null);
const loadError = ref(null);

const newTarget    = ref(null);    // 豆包对标 / 可灵整段对标
const newGenerated = ref(null);    // 豆包生成
const klingNew     = ref([]);      // 可灵每镜新选文件 [{targetSeg, gen}]，与 promptJson 对齐
const note         = ref("");
const saving       = ref(false);
const error        = ref(null);
const savedMsg     = ref(null);

const canSave = computed(() => {
  if (newTarget.value) return true;
  if (note.value !== (feeding.value?.note || "")) return true;
  if (feeding.value?.platform === "kling") return klingNew.value.some(s => s.targetSeg || s.gen);
  return !!newGenerated.value;
});

// 按当前分镜数初始化每镜文件槽（可灵）
function initKlingNew(f) {
  klingNew.value = (f?.promptJson || []).map(() => ({ targetSeg: null, gen: null }));
}

async function load() {
  try {
    const res = await feedingsApi.getById(route.params.id);
    feeding.value = res.data;
    note.value = res.data.note || "";
    initKlingNew(res.data);
  } catch (err) {
    loadError.value = err.message || "加载失败";
  }
}

async function save() {
  if (!canSave.value || saving.value) return;
  error.value = null;
  savedMsg.value = null;

  const fd = new FormData();
  if (newTarget.value) fd.append("targetVideo", newTarget.value);   // 整段对标 / 豆包对标
  if (feeding.value.platform === "kling") {
    klingNew.value.forEach((s, i) => {
      if (s.targetSeg) fd.append(`klingTarget_${i}`, s.targetSeg);
      if (s.gen)       fd.append(`klingGen_${i}`,    s.gen);
    });
  } else if (newGenerated.value) {
    fd.append("generatedVideo", newGenerated.value);
  }
  if (note.value !== (feeding.value.note || "")) fd.append("note", note.value.trim());

  saving.value = true;
  try {
    const res = await feedingsApi.update(route.params.id, fd);
    feeding.value = res.data;
    note.value = res.data.note || "";
    newTarget.value = null;
    newGenerated.value = null;
    initKlingNew(res.data);
    savedMsg.value = "已保存 ✓";
    setTimeout(() => { savedMsg.value = null; }, 2500);
  } catch (err) {
    error.value = err.message || "保存失败，请重试";
  } finally {
    saving.value = false;
  }
}

function fmtTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

onMounted(load);
</script>
