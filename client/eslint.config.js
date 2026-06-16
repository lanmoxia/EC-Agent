// ESLint 9 flat config — Vue 3 + Vite 前端
import js from "@eslint/js";
import pluginVue from "eslint-plugin-vue";

export default [
  js.configs.recommended,
  ...pluginVue.configs["flat/recommended"],
  {
    files: ["src/**/*.{js,vue}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        fetch: "readonly",
        FormData: "readonly",
        EventSource: "readonly",
        URL: "readonly",
        Blob: "readonly",
        localStorage: "readonly",
        alert: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }],
      "no-empty": ["warn", { allowEmptyCatch: true }],
      // 组件名单词数不强制（项目里有 HomeView/TaskView 等单文件视图）
      "vue/multi-word-component-names": "off",
      "vue/no-v-html": "off",
      // 以下为纯排版风格规则，与项目现有手写风格冲突，关闭以免噪音淹没真实问题
      "vue/max-attributes-per-line": "off",
      "vue/singleline-html-element-content-newline": "off",
      "vue/html-self-closing": "off",
      "vue/html-indent": "off",
      "vue/attributes-order": "off",
      "vue/first-attribute-linebreak": "off",
      "vue/multiline-html-element-content-newline": "off",
    },
  },
  {
    ignores: ["node_modules/**", "dist/**"],
  },
];
