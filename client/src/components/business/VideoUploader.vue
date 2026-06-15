<template>
  <div class="space-y-3">
    <!-- 区块1：视频选择 -->
    <div
      class="relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed transition-all duration-200 cursor-pointer"
      :class="[
        isDragging
          ? 'border-primary bg-primary/5 scale-[1.01]'
          : 'border-border hover:border-primary/50 hover:bg-accent/30',
        selectedVideo ? 'py-4' : 'py-12',
      ]"
      @dragover.prevent="isDragging = true"
      @dragleave.prevent="isDragging = false"
      @drop.prevent="onDrop"
      @click="!selectedVideo && fileInput?.click()"
    >
      <input
        ref="fileInput"
        type="file"
        accept="video/mp4,video/quicktime,video/x-matroska,video/webm,video/x-msvideo,.mp4,.mov,.mkv,.webm,.avi,.m4v"
        class="hidden"
        @change="onFileChange"
      />

      <!-- 未选择 -->
      <template v-if="!selectedVideo">
        <div class="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 mb-3">
          <UploadCloud class="h-6 w-6 text-primary" />
        </div>
        <p class="text-base font-medium">拖拽视频到此处</p>
        <p class="mt-1 text-sm text-muted-foreground">或点击选择文件</p>
        <p class="mt-2 text-xs text-muted-foreground">MP4 / MOV / MKV / WebM，最大 100MB</p>
      </template>

      <!-- 已选择 -->
      <template v-else>
        <div class="flex w-full items-center gap-3 px-5">
          <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <FileVideo class="h-5 w-5 text-primary" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium truncate">{{ selectedVideo.name }}</p>
            <p class="text-xs text-muted-foreground">{{ (selectedVideo.size / 1024 / 1024).toFixed(1) }} MB</p>
          </div>
          <button
            class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
            @click.stop="selectedVideo = null"
          >
            <X class="h-4 w-4" />
          </button>
        </div>
      </template>
    </div>

    <!-- 区块2：参考图（可选，可折叠） -->
    <div class="rounded-xl border border-border bg-card overflow-hidden">
      <button
        class="flex w-full items-center justify-between px-4 py-3 text-left"
        @click="showRefImages = !showRefImages"
      >
        <div class="flex items-center gap-2">
          <Images class="h-4 w-4 text-muted-foreground" />
          <span class="text-sm font-medium">参考图</span>
          <span class="text-xs text-muted-foreground">可选</span>
          <Badge v-if="refImages.length" variant="secondary" class="ml-1 text-xs">{{ refImages.length }}</Badge>
        </div>
        <ChevronDown
          class="h-4 w-4 text-muted-foreground transition-transform duration-200"
          :class="showRefImages && 'rotate-180'"
        />
      </button>

      <div v-if="showRefImages" class="border-t border-border p-4 space-y-4">
        <!-- 图片上传区 -->
        <div
          v-if="refImages.length < 5"
          class="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border py-4 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:bg-accent/20"
          @click="imageInput?.click()"
        >
          <ImagePlus class="h-4 w-4" />
          点击上传图片（最多5张）
        </div>
        <input
          ref="imageInput"
          type="file"
          accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
          multiple
          class="hidden"
          @change="onImagesChange"
        />

        <!-- 图片网格 -->
        <div v-if="refImages.length" class="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div v-for="(img, i) in refImages" :key="i" class="space-y-2">
            <div class="relative">
              <img :src="img.preview" class="h-24 w-full rounded-lg border border-border object-cover" />
              <button
                class="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-background/90 text-muted-foreground hover:text-destructive"
                @click="removeRefImage(i)"
              >
                <X class="h-3 w-3" />
              </button>
            </div>
            <!-- 标签按钮 -->
            <div class="flex flex-wrap gap-1">
              <button
                v-for="lbl in IMAGE_LABELS"
                :key="lbl.key"
                class="rounded-full border px-2 py-0.5 text-xs transition-colors"
                :class="img.label === lbl.key
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:border-primary/40'"
                @click="img.label = img.label === lbl.key ? '' : lbl.key"
              >{{ lbl.name }}</button>
            </div>
          </div>
        </div>

        <p v-if="refImages.some(i => !i.label)" class="text-xs text-amber-400">
          ⚠ 未打标的图片将以"未标注"传入分析
        </p>
      </div>
    </div>

    <!-- 区块3：台词（可选，可折叠） -->
    <div class="rounded-xl border border-border bg-card overflow-hidden">
      <button
        class="flex w-full items-center justify-between px-4 py-3 text-left"
        @click="showScript = !showScript"
      >
        <div class="flex items-center gap-2">
          <FileText class="h-4 w-4 text-muted-foreground" />
          <span class="text-sm font-medium">台词</span>
          <span class="text-xs text-muted-foreground">可选，替换视频原台词</span>
        </div>
        <ChevronDown
          class="h-4 w-4 text-muted-foreground transition-transform duration-200"
          :class="showScript && 'rotate-180'"
        />
      </button>

      <div v-if="showScript" class="border-t border-border p-4 space-y-4">
        <!-- 模式选择 -->
        <div class="flex gap-1 rounded-lg bg-muted p-1 w-fit">
          <button
            v-for="mode in SCRIPT_MODES"
            :key="mode.key"
            class="rounded-md px-3 py-1.5 text-sm font-medium transition-all"
            :class="scriptMode === mode.key
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'"
            @click="scriptMode = mode.key"
          >{{ mode.label }}</button>
        </div>

        <!-- 单人 -->
        <textarea
          v-if="scriptMode === 'single'"
          v-model="scriptSingle"
          placeholder="输入台词内容…"
          rows="4"
          class="w-full resize-none rounded-lg border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />

        <!-- 多人对话 -->
        <div v-else-if="scriptMode === 'multi'" class="space-y-2">
          <div v-for="(line, i) in scriptLines" :key="i" class="flex items-start gap-2">
            <input
              v-model="line.speaker"
              list="speaker-list"
              placeholder="说话人"
              class="w-24 shrink-0 rounded-md border border-input bg-background px-2.5 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <datalist id="speaker-list">
              <option v-for="s in DEFAULT_SPEAKERS" :key="s" :value="s" />
            </datalist>
            <textarea
              v-model="line.text"
              placeholder="台词内容…"
              rows="2"
              class="flex-1 resize-none rounded-md border border-input bg-background px-2.5 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              class="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
              @click="scriptLines.splice(i, 1)"
            >
              <X class="h-4 w-4" />
            </button>
          </div>
          <button
            class="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors"
            @click="scriptLines.push({ speaker: '', text: '' })"
          >
            <Plus class="h-4 w-4" /> 添加说话人
          </button>
        </div>

        <!-- 有画外音 -->
        <div v-else class="space-y-3">
          <div>
            <label class="mb-1.5 block text-xs font-medium text-muted-foreground">画内台词</label>
            <textarea
              v-model="scriptOnscreen"
              placeholder="画面中人物说的话…"
              rows="3"
              class="w-full resize-none rounded-lg border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label class="mb-1.5 block text-xs font-medium text-muted-foreground">画外音</label>
            <textarea
              v-model="scriptVoiceover"
              placeholder="画外旁白或 VO…"
              rows="3"
              class="w-full resize-none rounded-lg border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- 上传进度 -->
    <div v-if="uploading" class="space-y-1.5">
      <Progress :model-value="uploadProgress" />
      <p class="text-center text-xs text-muted-foreground">上传中 {{ uploadProgress }}%</p>
    </div>

    <!-- 错误提示 -->
    <div
      v-if="error"
      class="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
    >
      <AlertCircle class="h-4 w-4 shrink-0" />
      {{ error }}
    </div>

    <!-- 提交按钮 -->
    <Button
      :disabled="!selectedVideo || uploading"
      class="w-full"
      size="lg"
      @click="submit"
    >
      <Loader2 v-if="uploading" class="mr-2 h-4 w-4 animate-spin" />
      <UploadCloud v-else class="mr-2 h-4 w-4" />
      {{ uploading ? `上传中 ${uploadProgress}%` : '开始分析' }}
    </Button>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";
import {
  UploadCloud, Loader2, AlertCircle, X, FileVideo,
  Images, ImagePlus, FileText, ChevronDown, Plus,
} from "lucide-vue-next";
import Button from "@/components/ui/Button.vue";
import Badge from "@/components/ui/Badge.vue";
import Progress from "@/components/ui/Progress.vue";
import { useUpload } from "@/composables/useUpload";

const props = defineProps({
  platform: { type: String, default: "douban" }, // 'douban' | 'kling'
});

const emit = defineEmits(["uploaded"]);

const { uploading, uploadProgress, error, upload } = useUpload();

const fileInput    = ref(null);
const isDragging   = ref(false);
const selectedVideo = ref(null);

const imageInput    = ref(null);
const showRefImages = ref(false);
const refImages     = ref([]);

const showScript      = ref(false);
const scriptMode      = ref("single");
const scriptSingle    = ref("");
const scriptLines     = ref([{ speaker: "女主", text: "" }]);
const scriptOnscreen  = ref("");
const scriptVoiceover = ref("");

const ALL_IMAGE_LABELS = [
  { key: "scene_clean",     name: "干净场景" },
  { key: "book",            name: "道具书" },
  { key: "character",       name: "角色图" },
  { key: "scene_with_char", name: "有角色场景" },
];

// 豆包只需要场景+书；可灵需要全部
const IMAGE_LABELS = computed(() =>
  props.platform === "douban"
    ? ALL_IMAGE_LABELS.filter(l => ["scene_clean", "book"].includes(l.key))
    : ALL_IMAGE_LABELS
);

const SCRIPT_MODES = [
  { key: "single",    label: "单人" },
  { key: "multi",     label: "多人对话" },
  { key: "voiceover", label: "有画外音" },
];

const DEFAULT_SPEAKERS = ["女主", "男主", "孩子", "画外音"];

const VIDEO_EXTS = /\.(mp4|mov|mkv|webm|avi|m4v)$/i;
const MAX_MB = 100;

function validateVideo(file) {
  if (!file.type.startsWith("video/") && !VIDEO_EXTS.test(file.name)) {
    return "不支持该格式，请上传 MP4 / MOV / MKV / WebM / AVI";
  }
  if (file.size > MAX_MB * 1024 * 1024) {
    return `文件过大（${(file.size / 1024 / 1024).toFixed(1)}MB），最大 ${MAX_MB}MB`;
  }
  return null;
}

function onDrop(e) {
  isDragging.value = false;
  const file = e.dataTransfer?.files?.[0];
  if (!file) return;
  const err = validateVideo(file);
  if (err) { error.value = err; return; }
  error.value = null;
  selectedVideo.value = file;
}

function onFileChange(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const err = validateVideo(file);
  if (err) { error.value = err; return; }
  error.value = null;
  selectedVideo.value = file;
  e.target.value = "";
}

function onImagesChange(e) {
  const files = Array.from(e.target.files || []);
  const remaining = 5 - refImages.value.length;
  files.slice(0, remaining).forEach(file => {
    refImages.value.push({ file, preview: URL.createObjectURL(file), label: "" });
  });
  e.target.value = "";
}

function removeRefImage(i) {
  URL.revokeObjectURL(refImages.value[i].preview);
  refImages.value.splice(i, 1);
}

function buildScriptJson() {
  if (scriptMode.value === "single") {
    return { text: scriptSingle.value.trim() };
  }
  if (scriptMode.value === "multi") {
    return { lines: scriptLines.value.filter(l => l.text.trim()) };
  }
  return {
    onscreen: scriptOnscreen.value.trim(),
    voiceover: scriptVoiceover.value.trim(),
  };
}

async function submit() {
  if (!selectedVideo.value || uploading.value) return;
  error.value = null;

  const formData = new FormData();
  formData.append("video", selectedVideo.value);
  formData.append("platform", props.platform);

  if (refImages.value.length) {
    const labels = [];
    refImages.value.forEach(img => {
      formData.append("refImages", img.file);
      labels.push(img.label);
    });
    formData.append("refLabels", JSON.stringify(labels));
  }

  if (showScript.value) {
    const scriptData = buildScriptJson();
    const hasContent =
      scriptMode.value === "single"    ? !!scriptData.text :
      scriptMode.value === "multi"     ? scriptData.lines?.length > 0 :
      !!(scriptData.onscreen || scriptData.voiceover);
    if (hasContent) {
      formData.append("scriptMode", scriptMode.value);
      formData.append("scriptJson", JSON.stringify(scriptData));
    }
  }

  try {
    const task = await upload(formData);
    emit("uploaded", task);
  } catch {
    // error 已由 useUpload 设置
  }
}
</script>
