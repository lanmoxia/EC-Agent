import { defineStore } from "pinia";
import { ref } from "vue";
import { tasksApi } from "@/api/tasks.api";

export const useTaskStore = defineStore("task", () => {
  const tasks = ref([]);
  const currentTask = ref(null);
  const loading = ref(false);

  async function fetchTask(id) {
    loading.value = true;
    try {
      const res = await tasksApi.getById(id);
      currentTask.value = res.data;
      return res.data;
    } finally {
      loading.value = false;
    }
  }

  async function fetchList(params) {
    loading.value = true;
    try {
      const res = await tasksApi.list(params);
      tasks.value = res.data;
      return res;
    } finally {
      loading.value = false;
    }
  }

  function updateTaskStatus(id, status, errorMsg = null) {
    const task = tasks.value.find((t) => t.id === id);
    if (task) {
      task.status = status;
      if (errorMsg) task.error_msg = errorMsg;
    }
    if (currentTask.value?.id === id) {
      currentTask.value = { ...currentTask.value, status, error_msg: errorMsg };
    }
  }

  return { tasks, currentTask, loading, fetchTask, fetchList, updateTaskStatus };
});
