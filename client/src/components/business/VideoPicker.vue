<template>
  <div class="space-y-2">
    <div
      class="relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed transition-all duration-200 cursor-pointer"
      :class="[
        isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-accent/30',
        (modelValue || existingName) ? 'py-4' : 'py-10',
      ]"
      @dragover.prevent="isDragging = true"
      @dragleave.prevent="isDragging = false"
      @drop.prevent="onDrop"
      @click="fileInput?.click()"
    >
      <input
        ref="fileInput"
        type="file"
        accept="video/mp4,video/quicktime,video/x-matroska,video/webm,video/x-msvideo,.mp4,.mov,.mkv,.webm,.avi,.m4v"
        class="hidden"
        @change="onFileChange"
      />

      <!-- 已选新文件 -->
      <template v-if="modelValue">
        <div class="flex w-full items-center gap-3 px-5">
          <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <FileVideo class="h-5 w-5 text-primary" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium truncate">{{ modelValue.name }}</p>
            <p class="text-xs text-muted-foreground">{{ (modelValue.size / 1024 / 1024).toFixed(1) }} MB · 待提交</p>
          </div>
          <button
            class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
            @click.stop="clear"
          >
            <X class="h-4 w-4" />
          </button>
        </div>
      </template>

      <!-- 已有视频（详情页补传时显示当前） -->
      <template v-else-if="existingName">
        <div class="flex w-full items-center gap-3 px-5">
          <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
            <FileVideo class="h-5 w-5 text-emerald-400" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium truncate">{{ existingName }}</p>
            <p class="text-xs text-muted-foreground">已上传 · 点击替换</p>
          </div>
        </div>
      </template>

      <!-- 空 -->
      <template v-else>
        <div class="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 mb-2">
          <UploadCloud class="h-5 w-5 text-primary" />
        </div>
        <p class="text-sm font-medium">{{ placeholder }}</p>
        <p class="mt-1 text-xs text-muted-foreground">拖拽或点击选择 · MP4/MOV/MKV，最大 {{ MAX_MB }}MB</p>
      </template>
    </div>

    <p v-if="error" class="flex items-center gap-1.5 text-xs text-destructive">
      <AlertCircle class="h-3.5 w-3.5 shrink-0" />{{ error }}
    </p>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { UploadCloud, FileVideo, X, AlertCircle } from "lucide-vue-next";

defineProps({
  modelValue:   { type: Object, default: null },   // File | null
  existingName: { type: String, default: "" },     // 已上传视频文件名（详情页）
  placeholder:  { type: String, default: "选择视频" },
});
const emit = defineEmits(["update:modelValue"]);

const fileInput  = ref(null);
const isDragging  = ref(false);
const error       = ref(null);

const VIDEO_EXTS = /\.(mp4|mov|mkv|webm|avi|m4v)$/i;
const MAX_MB = 100;

function validate(file) {
  if (!file.type.startsWith("video/") && !VIDEO_EXTS.test(file.name)) {
    return "不支持该格式，请上传 MP4 / MOV / MKV / WebM / AVI";
  }
  if (file.size > MAX_MB * 1024 * 1024) {
    return `文件过大（${(file.size / 1024 / 1024).toFixed(1)}MB），最大 ${MAX_MB}MB`;
  }
  return null;
}

function pick(file) {
  if (!file) return;
  const err = validate(file);
  if (err) { error.value = err; return; }
  error.value = null;
  emit("update:modelValue", file);
}

function onDrop(e) {
  isDragging.value = false;
  pick(e.dataTransfer?.files?.[0]);
}
function onFileChange(e) {
  pick(e.target.files?.[0]);
  e.target.value = "";
}
function clear() {
  error.value = null;
  emit("update:modelValue", null);
}
</script>
