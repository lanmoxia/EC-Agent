<template>
  <div class="rounded-xl border border-dashed border-border bg-card p-6 space-y-4">
    <div class="flex items-center gap-2">
      <h3 class="font-semibold text-base">上传生成视频，对比分析</h3>
    </div>

    <!-- Drop zone -->
    <div
      @click="fileInput.click()"
      @dragover.prevent="isDragging = true"
      @dragleave.prevent="isDragging = false"
      @drop.prevent="onDrop"
      :class="[
        'relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 cursor-pointer transition-colors',
        isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/50'
      ]"
    >
      <template v-if="selectedVideo">
        <FileVideo class="h-8 w-8 text-primary mb-2" />
        <p class="text-sm font-medium">{{ selectedVideo.name }}</p>
        <p class="text-xs text-muted-foreground">{{ (selectedVideo.size / 1024 / 1024).toFixed(1) }}MB</p>
        <button
          class="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
          @click.stop="selectedVideo = null"
        >
          <X class="h-4 w-4" />
        </button>
      </template>
      <template v-else>
        <UploadCloud class="h-8 w-8 text-muted-foreground mb-2" />
        <p class="text-sm text-muted-foreground">拖拽或点击上传豆包生成的视频</p>
        <p class="text-xs text-muted-foreground/60 mt-1">MP4 / MOV / WebM，最大 100MB</p>
      </template>
    </div>
    <input
      ref="fileInput"
      type="file"
      accept="video/mp4,video/quicktime,video/webm,video/x-matroska,video/avi"
      hidden
      @change="onFileChange"
    />

    <p v-if="error" class="text-sm text-destructive">{{ error }}</p>

    <!-- 文字反馈 -->
    <div class="space-y-1.5">
      <label class="text-sm font-medium text-muted-foreground">你觉得哪里不像？（选填）</label>
      <textarea
        v-model="feedback"
        rows="3"
        placeholder="例如：手部动作不对、颜色偏差、台词说错…"
        class="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
      />
    </div>

    <div class="flex justify-end">
      <Button :disabled="!selectedVideo || uploading" @click="submit" class="gap-2">
        <Loader2 v-if="uploading" class="h-4 w-4 animate-spin" />
        {{ uploading ? `上传中 ${uploadProgress}%` : '提交对比分析' }}
      </Button>
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { UploadCloud, FileVideo, X, Loader2 } from "lucide-vue-next";
import Button from "@/components/ui/Button.vue";
import { tasksApi } from "@/api/tasks.api";

const props = defineProps({
  parentId: { type: String, required: true },
});

const emit = defineEmits(["submitted"]);

const fileInput     = ref(null);
const isDragging    = ref(false);
const selectedVideo = ref(null);
const feedback      = ref("");
const uploading     = ref(false);
const uploadProgress = ref(0);
const error         = ref(null);

const VIDEO_EXTS = /\.(mp4|mov|mkv|webm|avi|m4v)$/i;

function validateVideo(file) {
  if (!file.type.startsWith("video/") && !VIDEO_EXTS.test(file.name)) {
    return "不支持该格式，请上传 MP4 / MOV / MKV / WebM / AVI";
  }
  if (file.size > 100 * 1024 * 1024) {
    return `文件过大（${(file.size / 1024 / 1024).toFixed(1)}MB），最大 100MB`;
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

async function submit() {
  if (!selectedVideo.value || uploading.value) return;
  error.value = null;
  uploading.value = true;
  uploadProgress.value = 0;

  const formData = new FormData();
  formData.append("video", selectedVideo.value);
  if (feedback.value.trim()) {
    formData.append("feedback", feedback.value.trim());
  }

  try {
    const res = await tasksApi.compare(props.parentId, formData, (e) => {
      if (e.total) uploadProgress.value = Math.round((e.loaded / e.total) * 100);
    });
    emit("submitted", res.data);
  } catch (err) {
    error.value = err.message || "上传失败，请重试";
  } finally {
    uploading.value = false;
  }
}
</script>
