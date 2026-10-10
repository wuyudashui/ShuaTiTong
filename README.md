# 刷题通

一个纯前端交互式刷题 Web 应用，支持单选框、判断、多选、填空四种题型。提供普通刷题和模拟考试两种模式，支持 AI 智能解析，可打包为 Android APK。

## 快速开始

```bash
npm install
npm run dev
```

浏览器打开终端提示的地址（默认 http://localhost:5173），在题库池中选择科目，或导入自己的 JSON 题库开始练习。本地导入只保存到自己的浏览器，不影响其他用户；公共题库由开发者发布维护。其他格式先使用配套 `shuatitong-any2json` 技能转换，或联系 2442078047@qq.com 协助处理。

在线地址：[GitHub Pages](https://wuyudashui.github.io/ShuaTiTong/)。Android 下载：[最新测试 APK](https://github.com/wuyudashui/ShuaTiTong/releases/download/android-latest/shuatitong.apk)。发布配置与安装说明见 [部署说明](docs/deployment.md)。

### 构建生产版本

```bash
npm run build
# 输出到 www/
```

部署时需要上传完整的 `www/` 目录，包括 `assets/` 中的 JavaScript、CSS 和字体；只上传 `index.html` 会导致界面或按钮失效。不要直接双击源码 `index.html`，开发时使用 `npm run dev`，生产版本使用 `npm run preview` 或静态网站服务器打开。

### 显示回归检查

```bash
npx playwright install chromium # 首次运行需要安装测试浏览器
npm run test:display
npx tsc --noEmit
```

显示检查会先构建生产版本，然后自动验证桌面与手机宽度下的题库导入、答题、切题、进度恢复、主题切换和错误处理。

### 打包 Android APK

推送应用代码到 GitHub，Actions 自动构建 APK 并更新 `android-latest` 下载资源。APK 通过 HTTPS 打开 Pages 网站，题库更新无需重新安装 APP。

## 功能

- **四种题型**：单选、判断、多选、填空
- **模拟考试**：按题型分组随机抽题，选项顺序打乱，统一提交判卷，生成成绩单
- **题型筛选**：按题型分类刷题
- **即时反馈**（普通模式）：答题后立即显示对错和解析
- **错题本**：自动收集错题，支持点击跳转复习
- **进度统计**：正确/错误次数、正确率
- **AI 智能解析**：调用大语言模型生成题目详细解析
- **随机刷题**：随机跳转题目
- **暗色主题**：一键切换
- **数据持久化**：localStorage 保存进度，刷新不丢失
- **最近打开**：快速重新加载已上传过的题库
- **键盘快捷键**：← 上一题，→ 下一题，Space 随机，A-E 选项选择

## 题库格式

支持上传自定义 JSON 文件，格式如下：

```json
[
  {
    "id": 1,
    "type": "single",
    "question": "题干文本",
    "options": {
      "A": "选项A",
      "B": "选项B",
      "C": "选项C",
      "D": "选项D"
    },
    "answer": "B",
    "difficulty": "易",
    "explanation": "解析内容（可为空）"
  }
]
```

### `type` 取值

| 值 | 题型 | 说明 |
| --- | --- | --- |
| `single` | 单选 | 选项 A/B/C/D，点击即判对错 |
| `judge` | 判断 | 选项固定为 A(正确) B(错误)，answer 填 A 或 B |
| `multi` | 多选 | 勾选后统一提交，answer 填组合如 `"ACD"` |
| `fill` | 填空 | options 填各空答案如 `{"空1":"void","空2":"args"}`，answer 可为空 |

## 开发

```bash
# 启动开发服务器（热更新）
npm run dev

# 构建生产版本
npm run build

# 预览构建产物
npm run preview

# 同步到 Capacitor Android 平台
npm run cap:sync

# 在 Android Studio 中打开
npm run cap:open
```

## 打包为 APK

### 在线编译（推荐，无需本地 SDK）

推送代码到 GitHub 仓库，[Actions](https://github.com/wuyudashui/ShuaTiTong/actions) 自动编译。可从 `android-latest` Release 下载 `shuatitong.apk`，或在工作流 Artifacts 中下载 `shuatitong-android-debug`。当前生成测试包；签名与更新限制见部署说明。

### 本地编译

```bash
npm install
npx cap add android
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
# APK 生成在 android/app/build/outputs/apk/debug/
```

需要安装：Node.js、Java 21、Android SDK。

### APK 版本（直接下载）

从 [Releases](https://github.com/wuyudashui/ShuaTiTong/releases) 或 [Actions](https://github.com/wuyudashui/ShuaTiTong/actions) 下载最新 APK，安装后打开即可使用（题库需自行上传）。

## 项目结构

```text
├── index.html                 # Vite 入口 HTML
├── data/question-banks/       # 示例题库与本地题库文件
├── public/                    # 开发期静态资源
├── www/                      # Vite / Capacitor 构建输出（不要手动编辑）
├── legacy/                   # 旧版单文件页面，仅作参考
├── docs/manuals/             # 用户手册与源代码文档
├── docs/copyright/           # 软著申请材料
├── src/
│   ├── main.ts                # 入口：DOM 绑定、渲染编排
│   ├── types.ts               # 核心类型定义
│   ├── state.ts               # 单例 Store — 全局状态管理
│   ├── storage.ts             # localStorage 持久层
│   ├── filter.ts              # 题型筛选逻辑
│   ├── format.ts              # Markdown→HTML 转换、自动解析
│   ├── ai.ts                  # AI 解析集成（DeepSeek API）
│   ├── utils.ts               # 通用工具函数（shuffleArray）
│   ├── styles.css             # 全部样式（CSS 变量，亮/暗主题）
│   ├── renderers/             # 策略模式题型渲染器
│   │   ├── index.ts           # 渲染器分发
│   │   ├── single.ts          # 单选 / 判断渲染
│   │   ├── multi.ts           # 多选渲染
│   │   └── fill.ts            # 填空渲染
│   └── ui/                    # UI 组件
│       ├── theme.ts           # 暗色/亮色切换
│       ├── settings.ts        # AI API 设置弹窗
│       ├── errorBook.ts       # 错题本视图
│       ├── examMode.ts        # 模拟考试设置、成绩单
│       └── questionGrid.ts    # 缩略图导航网格
├── capacitor.config.json      # Capacitor 配置
├── package.json               # 依赖声明
├── vite.config.ts             # Vite 构建配置
├── server/                   # 开发者主机发布服务
├── scripts/                  # 转换与构建辅助脚本
├── tests/                    # 网页与服务端回归检查
├── skills/                   # 新版题库转换技能
└── .github/workflows/
    ├── pages.yml             # GitHub Pages 部署
    └── android-apk.yml       # Android 测试包构建与下载发布
```

题库可以从 `data/question-banks/` 选择导入本地；公共题库位于 `public/question-banks/`，由 `catalog.json` 索引。`www/` 是完整构建输出。

## 开发者发布题库

在开发者主机安装服务依赖：`npm ci --prefix server`，将 GitHub 写入令牌配置到 `server/.env`（参考 `server/.env.example`），运行 `npm run publisher`。在本地开发页进入开发者模式，打开“题库池 → 开发者题库维护”，连接发布服务后选择 JSON、填写名称和科目，点击发布。令牌仅保存在开发者主机，网页中不填写 GitHub Token。

题库和目录以同一次 Git 提交更新，GitHub Pages 自动部署后对其他用户生效。覆盖同名题库需明确勾选“更新同名题库”。普通用户导入和答题只操作浏览器本地数据。

登录开发者模式后，每个公共题库卡片显示“管理”。连接发布服务后可修改题库名称、科目和简介，保存时只更新目录，不改题目；需要替换题目时选新 JSON，文件名保持不变。删除需二次确认；新增可点“维护题库 → 新增题库”。所有公共改动仅由开发者服务发布，本地练习数据不会被删除。

`skills/shuatitong-any2json/` 提供适配新版的转换技能，可安装到个人 Codex 技能目录。生成的题库是 JSON 数组，科目、标题等目录信息由发布表单填写。

## 技术栈

- **构建工具**：Vite 8
- **语言**：TypeScript
- **样式**：原生 CSS（CSS 自定义属性实现主题切换）
- **状态管理**：发布-订阅模式（Store 单例）
- **渲染策略**：策略模式（QuestionRenderer 接口）
- **AI 接口**：DeepSeek API / 兼容 OpenAI 的任意 API
- **持久化**：localStorage
- **移动端**：Capacitor 7 (Android WebView)
- **CI/CD**：GitHub Actions 自动编译 APK

## License

MIT
