import { ref, onUnmounted } from "vue";

/**
 * SSE 订阅封装。
 * @param {string} taskId
 * @param {object} handlers  事件处理器映射 { progress, done, error }
 */
export function useSSE(taskId, handlers = {}) {
  const connected = ref(false);
  let eventSource = null;

  function connect() {
    if (eventSource) return;

    eventSource = new EventSource(`/api/sse/${taskId}`);

    eventSource.onopen = () => {
      connected.value = true;
    };

    // 处理具名事件（progress / done / error）
    ["progress", "done", "error"].forEach((type) => {
      eventSource.addEventListener(type, (e) => {
        try {
          const payload = JSON.parse(e.data);
          handlers[type]?.(payload);
        } catch {
          handlers[type]?.({ message: e.data });
        }
        // 任务完成或失败后关闭连接
        if (type === "done" || type === "error") {
          disconnect();
        }
      });
    });

    eventSource.onerror = () => {
      connected.value = false;
      // 浏览器会自动重连，不需要手动处理
    };
  }

  function disconnect() {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
      connected.value = false;
    }
  }

  onUnmounted(disconnect);

  return { connected, connect, disconnect };
}
