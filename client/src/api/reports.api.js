import api from "./axios";

export const reportsApi = {
  list(params = {}) {
    return api.get("/reports", { params });
  },

  getByTaskId(taskId) {
    return api.get(`/reports/by-task/${taskId}`);
  },

  getById(id) {
    return api.get(`/reports/${id}`);
  },

  update(id, data) {
    return api.put(`/reports/${id}`, data);
  },

  // 自动对比两份报告，输出差异列表（comparisonReportId 用于后端缓存差异，避免刷新重跑）
  compareAnalyze(id, { comparisonReport, comparisonReportId }) {
    return api.post(`/reports/${id}/compare-analyze`, { comparisonReport, comparisonReportId });
  },

  // 基于差异分析+用户反馈重新生成豆包提示词
  reoptimize(id, { failureAnalysis, userFeedback }) {
    return api.post(`/reports/${id}/reoptimize`, { failureAnalysis, userFeedback });
  },

  // 采用某版提示词
  adoptPrompt(id, { strategy, text, index }) {
    return api.post(`/reports/${id}/adopt-prompt`, { strategy, text, index });
  },

  submitFeedback(reportId, { rating, comment, strategy }) {
    return api.post(`/reports/${reportId}/feedback`, { rating, comment, strategy });
  },

  exportFeedback() {
    return api.get("/reports/export/feedback").then(r => r.data);
  },

  // 提交提示词人工评审
  submitReview(reportId, { strategy, promptText, reviewText }) {
    return api.post(`/reports/${reportId}/reviews`, { strategy, promptText, reviewText });
  },

  // 获取某报告的所有评审
  getReviews(reportId) {
    return api.get(`/reports/${reportId}/reviews`);
  },

  // 最近N条评审（规则提炼用）
  getRecentReviews(limit = 30) {
    return api.get("/reports/reviews/recent", { params: { limit } });
  },
};
