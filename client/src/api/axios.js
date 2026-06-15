import axios from "axios";

const instance = axios.create({
  baseURL: "/api",
  timeout: 30_000,
  headers: { "Content-Type": "application/json" },
});

// 请求拦截器
instance.interceptors.request.use((config) => {
  return config;
});

// 响应拦截器 — 统一取出 data 字段，错误统一格式化
instance.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const msg =
      error.response?.data?.error?.message ||
      error.message ||
      "请求失败，请重试";
    return Promise.reject(new Error(msg));
  }
);

export default instance;
