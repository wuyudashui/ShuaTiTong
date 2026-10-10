# GitHub 发布与题库池实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复富文本公式、收紧开发者模式、增加 GitHub 题库池与 Pages/APK 发布入口。

**Architecture:** 前端统一渲染和只读题库目录；服务端代理 GitHub 写入；GitHub Actions 负责 Pages 和 APK 构建。

**Tech Stack:** Vite 8、TypeScript、KaTeX、Playwright、Node.js、Capacitor 7、GitHub Actions。

**Spec:** `docs/superpowers/specs/2026-10-10-github-publish-and-question-pool-design.md`

## Global Constraints

- GitHub Token 只允许存在服务端环境变量，不进入前端构建产物。
- 页面不展示默认账号和密码提示。
- 普通用户只读题库池，开发者上传必须经过服务端校验。
- 保留 `www/` 为 Capacitor 和静态部署构建输出。

---

### Task 1: 富文本公式回归测试

**Files:**
- Modify: `tests/error-handler.spec.cjs`

- [x] 添加 `$x^2$`、`\\(x^2\\)`、`\\[\\frac{1}{2}\\]`、代码块和错误公式的浏览器断言。
- [x] 添加开发者登录输入 `yuhao` 和配置密码后显示开发者控件的断言，并断言登录弹窗不包含密码提示文案。
- [x] 运行测试确认新增断言在现状下失败。

### Task 2: 统一公式渲染和开发者登录

**Files:**
- Modify: `src/format.ts`
- Modify: `src/ui/login.ts`
- Modify: `src/questions.ts`
- Modify: `src/storage.ts`

- [x] 将 Markdown/AI 文本中的四种公式定界符转换为 KaTeX，Markdown 解析器保护代码块和 HTML。
- [x] 公式解析失败时显示转义后的原始公式，不抛出异常。
- [x] 开发者模式使用 `yuhao`，删除页面中的账号密码提示；密码比较使用 Web Crypto SHA-256 哈希。
- [x] 保留服务端鉴权字段但不把密码写入页面文案。
- [x] 运行 Task 1 测试确认通过。

### Task 3: 题库目录与开发者题库池

**Files:**
- Create: `public/question-banks/catalog.json`
- Create: `server/github.js`
- Modify: `server/index.js`
- Modify: `src/questions.ts`
- Create: `src/ui/questionPool.ts`
- Modify: `src/main.ts`
- Modify: `index.html`
- Modify: `src/styles.css`

- [x] 定义目录条目和上传请求校验。
- [x] 增加只读目录加载、题库预览和加载使用流程。
- [x] 增加开发者上传 JSON 到服务端的流程；服务端调用 GitHub Git Data API 并刷新目录。
- [x] 公共发布与覆盖控件仅在开发者模式显示，本地导入对所有用户开放。
- [x] 增加网络失败、格式错误和权限失败提示。

### Task 4: Pages、APK 和下载入口

**Files:**
- Create: `.github/workflows/pages.yml`
- Modify: `.github/workflows/android-apk.yml`
- Modify: `index.html`
- Modify: `src/main.ts`
- Modify: `README.md`

- [x] 增加 Pages 构建部署 workflow。
- [x] 增加配置化 APP 下载按钮，默认链接到 Releases。
- [x] 更新发布说明和 Pages 地址说明。
- [x] 验证生产构建中的静态路径和资源引用。

### Task 5: 全量验证

**Files:**
- Modify: `tests/error-handler.spec.cjs`

- [x] 运行 `npm run build`。
- [x] 运行 `npx tsc --noEmit`。
- [x] 运行 `npm run test:display`。
- [x] 检查前端构建产物中不存在 GitHub Token 或服务端密码变量值。
