import api from "./axios";

// 投喂成功提示词（用户主动反馈入口）
export const feedingsApi = {
  // 新建（提示词必填，视频可选）；FormData
  create(formData, onUploadProgress) {
    return api.post("/feedings", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 0,
      onUploadProgress,
    });
  },

  list(params = {}) {
    return api.get("/feedings", { params });
  },

  getById(id) {
    return api.get(`/feedings/${id}`);
  },

  // 补/换视频，或改提示词/备注；FormData
  update(id, formData, onUploadProgress) {
    return api.patch(`/feedings/${id}`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 0,
      onUploadProgress,
    });
  },
};
