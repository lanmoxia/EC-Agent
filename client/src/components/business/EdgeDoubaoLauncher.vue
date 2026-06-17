<template>
  <div class="flex items-center gap-1.5 flex-wrap justify-end">
    <span class="text-xs text-muted-foreground">用 Edge 打开豆包：</span>

    <!-- 有 Edge 多账户：每个账户一个带状态色的按钮 -->
    <template v-if="profiles && profiles.length">
      <div
        v-for="p in profiles"
        :key="p.dir"
        class="relative"
        @mouseenter="hover = p.dir"
        @mouseleave="hover = null"
      >
        <!-- 账户按钮（点本体=打开豆包），颜色随状态 -->
        <button
          class="flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors"
          :class="STATUS_STYLE[statusOf(p.dir)]"
          :title="`账号「${p.name}」· ${STATUS_LABEL[statusOf(p.dir)]} · 点击用此账号打开豆包`"
          @click="$emit('open', p.dir)"
        >
          <span class="inline-block h-1.5 w-1.5 rounded-full" :class="STATUS_DOT[statusOf(p.dir)]" />
          {{ p.name }}
        </button>

        <!-- 悬浮状态菜单（紧贴按钮，无间隙桥接，便于移入点击） -->
        <div
          v-show="hover === p.dir"
          class="absolute right-0 top-full z-20 pt-1"
        >
          <div class="min-w-[120px] rounded-lg border border-border bg-card p-1 shadow-lg">
            <p class="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">设置额度状态</p>
            <button
              v-for="s in STATUS_ORDER"
              :key="s"
              class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-accent"
              :class="statusOf(p.dir) === s ? 'font-semibold' : 'text-muted-foreground'"
              @click="setStatus(p.dir, s)"
            >
              <span class="inline-block h-2 w-2 rounded-full" :class="STATUS_DOT[s]" />
              {{ STATUS_LABEL[s] }}
              <Check v-if="statusOf(p.dir) === s" class="ml-auto h-3 w-3 text-emerald-400" />
            </button>
          </div>
        </div>
      </div>
    </template>

    <!-- 没读到 Profile：退化为单按钮 -->
    <button
      v-else
      class="flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-400 transition-colors hover:bg-emerald-500/20"
      @click="$emit('open-default')"
    >
      <ExternalLink class="h-3.5 w-3.5" />
      打开豆包
    </button>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { ExternalLink, Check } from "lucide-vue-next";

defineProps({
  profiles: { type: Array, default: () => [] },
});
defineEmits(["open", "open-default"]);

// 状态定义
const STATUS_ORDER = ["normal", "update", "empty"];
const STATUS_LABEL = {
  normal: "正常",
  update: "待更新额度",
  empty:  "额度用完",
};
// 按钮整体配色（绿/黄/红）
const STATUS_STYLE = {
  normal: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20",
  update: "border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20",
  empty:  "border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20",
};
// 状态圆点色
const STATUS_DOT = {
  normal: "bg-emerald-400",
  update: "bg-amber-400",
  empty:  "bg-red-400",
};

const hover = ref(null);

// 状态持久化在本机 localStorage（Edge Profile 本就是本机的）
const STORE_KEY = "ec-doubao-acct-status";
const statusMap = ref(loadStatus());

function loadStatus() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
  } catch {
    return {};
  }
}
function statusOf(dir) {
  return statusMap.value[dir] || "normal"; // 默认正常（绿）
}
function setStatus(dir, s) {
  statusMap.value = { ...statusMap.value, [dir]: s };
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(statusMap.value));
  } catch { /* localStorage 不可用则只内存生效 */ }
  hover.value = null;
}
</script>
