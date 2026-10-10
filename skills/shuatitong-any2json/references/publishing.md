# 公共题库发布约定

普通用户导入 JSON 文件只加载自己的本地题库。转换请求授权生成文件；准备发布资料请求授权生成附属元数据；实际公开发布需要用户明确要求。技能本身不提供额外上传授权，也不修改公共目录。

## 分开的交付文件

题库 JSON 保持 `Question[]` 数组。用户明确要求准备公共池资料时，另附 `bank-meta.json`，可按 [元数据示例](../assets/bank-meta.json) 调整：

```json
{
  "filename": "linear-algebra.json",
  "name": "线性代数基础题库",
  "subject": "线性代数",
  "description": "矩阵与线性方程组练习",
  "overwrite": false
}
```

`name` 和 `subject` 必须为非空字符串，`description` 可空，`overwrite` 是布尔值且默认 `false`。filename 满足 `[A-Za-z0-9][A-Za-z0-9_-]*\.json`，推荐小写 ASCII slug。不能使用任何大小写的 `catalog.json`，不包含目录、中文、空格或路径穿越。元数据不含 `questions`、token、密码、API Key、服务凭据或 GitHub 凭据。

执行 `python -X utf8 <技能目录>/scripts/validate_bank.py <题库.json> --metadata <bank-meta.json>` 可校验两个文件及紧凑序列化发布请求的大小；该命令没有联网或上传行为。正式请求不超过 **8 MiB（8 × 1024 × 1024 字节）**，包括元数据和 Base64 图片开销。留出余量；过大时压缩可读图片或分拆题库，不静默改成外链。

## 开发者发布流程

公开文件存放在 `public/question-banks/<filename>`，目录为 `public/question-banks/catalog.json`。网站从部署后的 `question-banks/catalog.json` 读取 `{version:1,banks:[...]}`，条目包含 `filename`、`name`、`subject`、`description`、`path`、`count`、`types`、`updatedAt`。这些派生字段由发布服务维护，转换文件无需手写。

当用户明确授权实际发布时，使用项目开发者本地服务的 `POST /api/question-banks`，请求为元数据字段加 `questions` 数组：

```text
{filename, name, subject, description, questions, overwrite}
```

服务校验后把题库和目录一并提交，并触发网站更新。认证沿用当前配置，通过请求头发送；凭据不嵌入交付物或输出。选择“准备资料”时到文件交付即结束；转换不启动发布服务，也不调用发布 API。

同名文件默认返回冲突，只有用户已明确要求覆盖该文件时才设 `overwrite:true`。其他冲突先核对目录与目标，不通过自动覆盖扩大授权。认证失败、发布配置缺失或服务错误时保留已验证的文件并说明具体限制；不无限重试。只有服务成功响应并确认目录/文件结果后才能称为“已发布”，网站部署是否完成另以实际检查为准。
