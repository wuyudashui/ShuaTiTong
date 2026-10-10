# 发布与安装

刷题通的静态站点地址是 <https://wuyudashui.github.io/ShuaTiTong/>。`vite.config.ts` 使用相对资源路径，因此同一份 `www/` 构建产物可以在 GitHub Pages 项目路径和 Capacitor WebView 中运行。

## 开启 GitHub Pages

在仓库 **Settings → Pages** 中将 **Source** 设为 **GitHub Actions**。之后推送到 `main` 或手动运行 **Deploy GitHub Pages**，工作流会执行 `npm ci`、`npm run build`，上传 `www/`，再用 Pages 部署。Pages 工作流只需要 `contents: read`、`pages: write` 和 `id-token: write` 权限。

## Android 下载与构建

每次 `main` 上与应用代码、构建脚本或依赖相关的变更都会运行 **Android debug APK**。题库目录的单独更新不会触发 Android 构建，但仍会触发 Pages 发布。工作流使用 Node.js 22.14、Java 21，先构建 `www/`，再运行 `npx cap add android` 和 `npx cap sync android`，最后生成可安装的 debug APK。

下载按钮可以使用固定地址：

<https://github.com/wuyudashui/ShuaTiTong/releases/download/android-latest/shuatitong.apk>

`android-latest` 是一个滚动的 prerelease，工作流用仓库自动提供的 `GITHUB_TOKEN` 更新它的 `shuatitong.apk` 资产。令牌只在 GitHub Actions 中使用，不会进入网页或 APK；工作流声明了 `contents: write`，仓库的 Actions 设置需要允许该令牌写入内容/发布。

默认情况下，APK 的 Capacitor `server.url` 指向 Pages 站点，并强制使用 HTTPS，`allowNavigation` 只允许 `wuyudashui.github.io`。需要在其他 HTTPS 地址打包时，可在仓库 **Settings → Secrets and variables → Actions → Variables** 设置 `SHUATITONG_APP_URL`，或在本地运行配置脚本前设置同名环境变量；脚本会拒绝 HTTP、带账号密码、查询参数或片段的地址，并把允许导航域名限制为该地址的主机名。

APK 打开的是在线站点，需要联网；网站和公开题库更新后，已安装 APK 直接获取新内容，不需要为每次题库上传重新打包。

这些是 debug/test 包，没有提交发布签名密钥。由于 Android debug 密钥可能在构建环境变化，安装新包时如果系统提示签名不一致，请先卸载旧的 debug 包再安装；正式升级需要配置持久化的 release keystore 和 Actions secrets。

## 开发者题库上传权限

GitHub Pages 只提供静态文件，题库上传需由受密码保护的开发者服务调用 GitHub Contents API。用于此接口的 GitHub token 应使用 fine-grained personal access token，仓库范围只选择 `wuyudashui/ShuaTiTong`，授予 **Repository permissions → Contents: Read and write**，无需授予 Actions、Pages 或仓库管理权限。如果使用 classic token，公开仓库需要 `public_repo` 范围。

从项目根目录启动 `npm run publisher` 时，服务读取 `server/.env`。开发者在本地开发页连接发布服务最方便：开发页的 `/publisher` 路径会代理至 `127.0.0.1:3001`。普通用户的题库导入仅操作浏览器本地缓存，不调用该服务。

## 维护名称、科目与题目

网页显示的科目标签、题库标题和简介分别来自目录的 `subject`、`name`、`description`，由开发者填写；文件名是该题库的固定标识。登录开发者模式后，每张题库卡片有“管理”按钮，弹窗右上角也可进入“维护题库”。

- 修改名称、科目和简介：选“管理”，连接发布服务，改字段并保存，无需重新上传 JSON，题目文件保持原样。
- 更新题目：选“管理”，在同一表单选择新的 JSON，保存后覆盖原题库文件。
- 新增题库：选“新增题库”，上传 JSON 并填写文件名、展示名称、科目和简介。
- 删除题库：选“管理 → 删除公共题库”，确认后同时移除公开文件和目录条目；用户本机已加载的数据仍保留。

修改会检查读取时的仓库版本。如果期间其他管理者已提交内容，服务返回冲突，重新打开“管理”读取新版后再提交。请勿把 GitHub 写入凭据交给普通用户。

令牌放在开发者服务所在主机的 `SHUATITONG_GITHUB_TOKEN` 或 `GITHUB_TOKEN` 环境变量中。不要提交到仓库，也不要使用 `VITE_` 环境变量传递令牌，因为该前缀会把值写入公开的前端构建产物。
