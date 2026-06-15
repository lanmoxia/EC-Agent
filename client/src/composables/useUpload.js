import { ref } from "vue";
import { tasksApi } from "@/api/tasks.api";

export function useUpload() {
  const uploading = ref(false);
  const uploadProgress = ref(0);
  const error = ref(null);

  async function upload(formData) {
    uploading.value = true;
    uploadProgress.value = 0;
    error.value = null;

    try {
      const result = await tasksApi.create(formData, (e) => {
        if (e.total) {
          uploadProgress.value = Math.round((e.loaded / e.total) * 100);
        }
      });
      return result.data;
    } catch (err) {
      error.value = err.message;
      throw err;
    } finally {
      uploading.value = false;
    }
  }

  return { uploading, uploadProgress, error, upload };
}
