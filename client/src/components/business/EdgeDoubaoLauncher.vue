<template>
  <div class="flex items-center gap-1.5 flex-wrap justify-end">
    <span class="text-xs text-muted-foreground">用 Edge 打开豆包：</span>

    <!-- 有 Edge 多账户：每个账户一个带状态色的按钮 -->
    <template v-if="profiles && profiles.length">
      <div
        v-for="p in profiles"
        :key="p.dir"
        class="relative"
        @mouseenter="editing === p.dir ? null : (hover = p.dir)"
        @mouseleave="hover = null"
      >
        <!-- ===== 编辑态：标签变内联输入框（不依赖原生弹窗，VSCode 内嵌浏览器也可用）===== -->
        <template v-if="editing === p.dir">
          <!-- 输入框：自动聚焦并全选；Enter/失焦→询问保存；Esc→取消 -->
          <input
            v-if="!confirming"
            v-focus
            v-model="editValue"
            type="text"
            class="w-28 rounded-md border border-sky-500/60 bg-background px-2.5 py-1 text-xs font-medium text-foreground outline-none focus:border-sky-400"
            @keydown.enter.prevent="askSave(p)"
            @keydown.esc.prevent="cancelEdit"
            @blur="askSave(p)"
          />

          <!-- 待编辑名占位（确认阶段显示，避免输入框失焦反复触发）-->
          <button
            v-else
            class="flex items-center gap-1 rounded-md border border-sky-500/40 bg-sky-500/10 px-2.5 py-1 text-xs font-medium text-sky-400"
            disabled
          >
            {{ editValue }}
          </button>

          <!-- 内联保存确认气泡 -->
          <div
            v-if="confirming"
            class="absolute right-0 top-full z-30 pt-1"
          >
            <div class="min-w-[150px] rounded-lg border border-border bg-card p-2 shadow-lg">
              <p class="px-1 pb-1.5 text-xs text-foreground">
                保存为「<span class="font-semibold text-sky-400">{{ editValue }}</span>」？
              </p>
              <div class="flex gap-1.5">
                <button
                  class="flex-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-500/20"
                  @click="confirmSave(p)"
                >
                  保存
                </button>
                <button
                  class="flex-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent"
                  @click="cancelEdit"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        </template>

        <!-- ===== 正常态：账户按钮 + 悬浮菜单 ===== -->
        <template v-else>
          <!-- 账户按钮（点本体=打开豆包），颜色随状态 -->
          <button
            class="flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors"
            :class="STATUS_STYLE[statusOf(p.dir)]"
            :title="`账号「${nameOf(p)}」· ${STATUS_LABEL[statusOf(p.dir)]} · 点击用此账号打开豆包`"
            @click="$emit('open', p.dir)"
          >
            <span class="inline-block h-1.5 w-1.5 rounded-full" :class="STATUS_DOT[statusOf(p.dir)]" />
            {{ nameOf(p) }}
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

              <!-- 自定义标签名（覆盖 Edge 原名，存本机 localStorage） -->
              <div class="my-1 border-t border-border" />
              <p class="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">标签名</p>
              <button
                class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent"
                @click="startRename(p)"
              >
                <Pencil class="h-3 w-3" />
                重命名
              </button>
              <button
                v-if="labelMap[p.dir]"
                class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent"
                @click="resetName(p.dir)"
              >
                <RotateCcw class="h-3 w-3" />
                恢复默认（{{ p.name }}）
              </button>
            </div>
          </div>
        </template>
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
import { ExternalLink, Check, Pencil, RotateCcw } from "lucide-vue-next";

defineProps({
  profiles: { type: Array, default: () => [] },
});
defineEmits(["open", "open-default"]);

// 自动聚焦并全选输入框内容（点重命名时标签即为"选中可编辑"态）
const vFocus = {
  mounted(el) {
    el.focus();
    el.select();
  },
};

// 状态定义
const STATUS_ORDER = ["normal", "updated", "update", "empty"];
const STATUS_LABEL = {
  normal:  "正常",
  updated: "额度已更新",
  update:  "待更新额度",
  empty:   "额度用完",
};
// 按钮整体配色（绿/蓝/黄/红）
const STATUS_STYLE = {
  normal:  "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20",
  updated: "border-sky-500/40 bg-sky-500/10 text-sky-400 hover:bg-sky-500/20",
  update:  "border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20",
  empty:   "border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20",
};
// 状态圆点色
const STATUS_DOT = {
  normal:  "bg-emerald-400",
  updated: "bg-sky-400",
  update:  "bg-amber-400",
  empty:   "bg-red-400",
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

// 自定义标签名持久化（覆盖 Edge 原名，按 Profile dir 记，存本机 localStorage）
const LABEL_KEY = "ec-doubao-acct-label";
const labelMap = ref(loadLabels());

function loadLabels() {
  try {
    return JSON.parse(localStorage.getItem(LABEL_KEY) || "{}");
  } catch {
    return {};
  }
}
function saveLabels() {
  try {
    localStorage.setItem(LABEL_KEY, JSON.stringify(labelMap.value));
  } catch { /* localStorage 不可用则只内存生效 */ }
}
// 显示名：自定义标签优先，回退 Edge 原名
function nameOf(p) {
  return labelMap.value[p.dir] || p.name;
}
function resetName(dir) {
  const next = { ...labelMap.value };
  delete next[dir];
  labelMap.value = next;
  saveLabels();
  hover.value = null;
}

// ===== 内联重命名（替代被 VSCode 内嵌浏览器屏蔽的 window.prompt）=====
const editing = ref(null);     // 正在编辑的 Profile dir
const editValue = ref("");     // 输入框当前文本
const confirming = ref(false); // 是否处于"保存确认"步骤

// 点「重命名」→ 进入编辑态，预填当前显示名并全选
function startRename(p) {
  editing.value = p.dir;
  editValue.value = nameOf(p);
  confirming.value = false;
  hover.value = null;
}
// Enter / 失焦 → 询问是否保存（无改动则直接退出，不打扰）
function askSave(p) {
  if (editing.value !== p.dir || confirming.value) return;
  const v = editValue.value.trim();
  if (!v || v === nameOf(p)) {
    cancelEdit();
    return;
  }
  confirming.value = true;
}
// 确认保存：写入 localStorage 标签（填回 Edge 原名 = 恢复默认）
function confirmSave(p) {
  const v = editValue.value.trim();
  if (v && v !== p.name) {
    labelMap.value = { ...labelMap.value, [p.dir]: v };
  } else {
    const next = { ...labelMap.value };
    delete next[p.dir];
    labelMap.value = next;
  }
  saveLabels();
  editing.value = null;
  confirming.value = false;
}
// 取消：丢弃改动，恢复原名
function cancelEdit() {
  editing.value = null;
  confirming.value = false;
}
</script>
