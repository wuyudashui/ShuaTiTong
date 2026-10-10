# GitHub 发布与题库池设计方案

## 目标

让刷题通可以作为 GitHub Pages 网站访问，普通用户只读使用公开题库，开发者在开发者模式中维护题库并将 JSON 资源发布到 GitHub；同时修复 AI 解析和纠错中的公式显示问题，并提供 Android APK 下载入口。

## 架构

- 前端继续使用 Vite、TypeScript、原生 CSS 和 Capacitor，`www/` 作为统一构建输出。
- GitHub Pages 只承载静态前端、题库目录和 APK 下载链接，不保存写入凭据。
- 题库以 `public/question-banks/` 和公开仓库内容为来源，生成 `catalog.json` 供普通用户读取。
- 开发者上传通过 `server/` 的 GitHub Contents API 代理完成；GitHub Token 只存在开发者主机的环境变量中。
- AI 题干、选项、解析和纠错统一进入同一个安全富文本渲染器，公式使用 KaTeX，无法解析的公式保留可读文本。

## 权限

- 开发者模式登录名为 `yuhao`，登录界面不展示默认账号或密码提示。
- 前端只负责本地开发者模式开关；GitHub 写入接口必须在服务端再次鉴权。
- 默认密码不写入页面文案；服务端密码通过 `SHUATITONG_DEV_PASSWORD` 配置，开发环境可设置为用户指定的密码。
- GitHub Token 使用 `GITHUB_TOKEN` 或 `SHUATITONG_GITHUB_TOKEN` 环境变量，绝不进入前端构建产物。

## 题库池

- `question-banks/catalog.json` 记录题库名称、路径、题数和更新时间。
- 普通用户可查看目录、预览题数、加载公共题库，也可上传自己的 JSON / Excel / Word；本地上传仅保存到自己的浏览器，不写 GitHub、不影响其他用户。
- 公共题库发布控件仅在开发者模式显示，发布必须经过开发者主机再次鉴权。
- 开发者可选择本地 JSON，校验为题目数组后上传或覆盖对应题库，并刷新目录。
- 上传接口只允许 `.json` 文件名和题目数组，路径固定在题库目录下，避免路径穿越。

## 发布

- 新增 GitHub Pages workflow，构建 `www/` 后通过 Pages artifact 部署。
- APK workflow 构建在线站点的 Android 测试包，上传 workflow artifact 并发布到 `android-latest` Release，文件名为 `shuatitong.apk`。
- 前端下载按钮使用可配置的 `VITE_APP_DOWNLOAD_URL`，默认指向该 Release 的 APK 文件。
- 私密环境配置、开发者数据和软著资料仅保存在本机，不进入 Git 提交和 Pages 输出。

## 验证

- Playwright 显示回归测试覆盖公式、开发者登录、移动端布局、题库导入和错误处理。
- `npm run build`、`npx tsc --noEmit` 和 `npm run test:display` 必须通过。
- 服务端至少通过 TypeScript/Node 语法检查和路径校验测试。
