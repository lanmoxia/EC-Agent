import { createRouter, createWebHistory } from "vue-router";
import HomeView from "@/views/HomeView.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      name: "home",
      component: HomeView,
      meta: { title: "上传视频" },
    },
    {
      path: "/tasks/:id",
      name: "task",
      component: () => import("@/views/TaskView.vue"),
      meta: { title: "分析进度" },
    },
    {
      path: "/history",
      name: "history",
      component: () => import("@/views/HistoryView.vue"),
      meta: { title: "历史记录" },
    },
  ],
});

router.afterEach((to) => {
  document.title = `${to.meta.title || "视频分析"} — 视频分析平台`;
});

export default router;
