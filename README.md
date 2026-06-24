# 刷题通

一个纯前端交互式刷题 Web 应用，支持单选框、判断、多选、填空四种题型。提供普通刷题和模拟考试两种模式，支持 AI 智能解析，可打包为 Android APK。

## 快速开始

```bash
npm install
npm run dev
```

浏览器打开终端提示的地址（默认 http://localhost:5173），上传 JSON 题库即可开始刷题。

### 构建生产版本

```bash
npm run build
# 输出到 www/
```

### 打包 Android APK

推送代码到 GitHub，Actions 自动编译并上传 APK 产物。也可[本地编译](#打包为-apk)。

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

推送代码到 GitHub 仓库，[Actions](https://github.com/wuyudashui/ShuaTiTong/actions) 自动编译。进入 Actions 页面，选择最新成功运行的工作流，在 Artifacts 中下载 `shuatitong-apk`。

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
└── .github/workflows/
    └── build-apk.yml          # GitHub Actions 编译脚本
```

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
