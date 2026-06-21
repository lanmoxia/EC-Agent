<template>
  <div class="min-h-screen bg-background text-foreground">
    <!-- 顶部导航 -->
    <header class="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-sm">
      <div class="container flex h-14 items-center gap-6">
        <!-- Logo -->
        <router-link to="/" class="flex items-center gap-2 font-semibold tracking-tight">
          <div class="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
            <Video class="h-4 w-4 text-primary-foreground" />
          </div>
          <span class="hidden sm:inline">视频分析平台</span>
        </router-link>

        <!-- 导航链接 -->
        <nav class="flex items-center gap-4 text-sm">
          <router-link
            to="/"
            class="text-muted-foreground transition-colors hover:text-foreground"
            active-class="text-foreground font-medium"
            exact
          >
            上传
          </router-link>
          <router-link
            to="/feed"
            class="text-muted-foreground transition-colors hover:text-foreground"
            active-class="text-foreground font-medium"
          >
            投喂
          </router-link>
          <router-link
            to="/history"
            class="text-muted-foreground transition-colors hover:text-foreground"
            active-class="text-foreground font-medium"
          >
            历史记录
          </router-link>
        </nav>

        <!-- 右侧：主题切换 -->
        <div class="ml-auto flex items-center gap-2">
          <button
            class="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            @click="toggleTheme"
            :title="isDark ? '切换浅色' : '切换深色'"
          >
            <Sun v-if="isDark" class="h-4 w-4" />
            <Moon v-else class="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>

    <!-- 主内容区 -->
    <main class="container py-8">
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { Video, Sun, Moon } from "lucide-vue-next";

const isDark = ref(true);

function toggleTheme() {
  isDark.value = !isDark.value;
  document.documentElement.classList.toggle("dark", isDark.value);
  localStorage.setItem("theme", isDark.value ? "dark" : "light");
}

onMounted(() => {
  const saved = localStorage.getItem("theme");
  isDark.value = saved ? saved === "dark" : true;
  document.documentElement.classList.toggle("dark", isDark.value);
});
</script>

<style>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
