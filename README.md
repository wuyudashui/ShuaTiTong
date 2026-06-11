# 刷题通

一个纯前端交互式刷题 Web 应用，支持单选、判断、多选、填空四种题型。可打包为 Android APK。

## 快速开始

### 网页版（浏览器直接打开）

1. 下载 `shuatitong.html` 和 `merged_questions.json`
2. 双击 `shuatitong.html` 在浏览器打开
3. 点击 **上传 JSON 题库**，选择 `merged_questions.json`
4. 开始刷题

### APK 版（Android 手机）

从 [Releases](https://github.com/wuyudashui/ShuaTiTong/releases) 或 [Actions](https://github.com/wuyudashui/ShuaTiTong/actions) 下载最新 APK，安装后打开即可使用（题库已内置）。

## 功能

- **四种题型**：单选、判断、多选、填空
- **题型筛选**：按题型分类刷题
- **即时反馈**：答题后立即显示对错和解析
- **错题本**：自动收集错题，支持点击跳转复习
- **进度统计**：正确/错误次数、正确率
- **随机刷题**：随机跳转题目
- **暗色主题**：一键切换
- **数据持久化**：localStorage 保存进度，刷新不丢失
- **自定义题库**：支持上传自己的 JSON 题库文件
- **键盘快捷键**：← 上一题，→ 下一题，Space 随机

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

## 从 Excel 生成题库

```bash
pip install pandas openpyxl
python3 extract.py
# 输出 merged_questions.json
```

提取脚本会自动处理编码、判断题 Y/N 映射、多选答案提取、空题屏蔽等边界情况。

## 打包为 APK

本项目使用 Capacitor 将 Web 应用包装为 Android APK。

### 在线编译（推荐，无需本地 SDK）

推送代码到 GitHub 仓库，GitHub Actions 自动编译：

```yaml
# .github/workflows/build-apk.yml 已配置好
# 推送后进入 Actions 页面下载 APK
```

### 本地编译

```bash
npm install
npx cap add android
npx cap sync android
cd android && ./gradlew assembleDebug
# APK 生成在 android/app/build/outputs/apk/debug/
```

需要安装：Node.js、Java 21、Android SDK。

## 项目结构

```text
├── shuatitong.html              # 网页版（浏览器双击即用）
├── merged_questions.json        # 257 道题库
├── test.json                    # 测试用题库（含四种题型）
├── www/
│   └── index.html               # Capacitor 用入口（含自动加载题库）
├── capacitor.config.json        # Capacitor 配置
├── package.json                 # 依赖声明
└── .github/workflows/
    └── build-apk.yml            # GitHub Actions 编译脚本
```

## 技术栈

- 数据处理：Python + pandas + openpyxl
- 前端：原生 HTML / CSS / JavaScript（无框架）
- 持久化：localStorage
- 移动端：Capacitor (WebView)
- 编译：GitHub Actions

## License

MIT
