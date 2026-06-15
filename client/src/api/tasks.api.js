import api from "./axios";

export const tasksApi = {
  create(formData, onUploadProgress) {
    return api.post("/tasks", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 0,
      onUploadProgress,
    });
  },

  getById(id) {
    return api.get(`/tasks/${id}`);
  },

  list(params = {}) {
    return api.get("/tasks", { params });
  },

  // 上传生成视频，创建对比分析任务
  compare(parentId, formData, onUploadProgress) {
    return api.post(`/tasks/${parentId}/compare`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 0,
      onUploadProgress,
    });
  },

  // 获取最新对比任务
  getComparison(parentId) {
    return api.get(`/tasks/${parentId}/comparison`);
  },

  // 只重新生成豆包提示词（不重跑视频分析）
  regeneratePrompts(taskId) {
    return api.post(`/tasks/${taskId}/regenerate-prompts`);
  },
};
