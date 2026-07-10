# CreativeOS 部署说明

## 基础环境

- Node.js 20.19+ / 22.12+ / 24+
- PostgreSQL
- 可公开访问的对象存储或反向代理上传目录
- 后台定时任务能力，例如 cron、systemd timer 或云厂商定时触发器

## 必需环境变量

```bash
DATABASE_URL=postgresql://user:password@host:5432/creativeos?schema=public
AUTH_SESSION_SECRET=
CANVAS_MODEL_CREDENTIAL_SECRET=
CANVAS_CLEANUP_TOKEN=
CANVAS_TASK_WORKER_TOKEN=
CANVAS_ASSET_STORAGE_DRIVER=local
CANVAS_ASSET_PUBLIC_BASE_URL=
CANVAS_MEMORY_EMBEDDING_DRIVER=local
```

生产环境建议：

- `AUTH_SESSION_SECRET` 使用 32 字节以上随机字符串。
- `CANVAS_MODEL_CREDENTIAL_SECRET` 单独设置，不复用会话密钥。
- `CANVAS_CLEANUP_TOKEN` 和 `CANVAS_TASK_WORKER_TOKEN` 使用不同随机值。
- 云服务器优先使用 `s3` 或 `r2` 存储，不建议长期依赖本机磁盘。

## 对象存储

本地存储：

```bash
CANVAS_ASSET_STORAGE_DRIVER=local
CANVAS_ASSET_PUBLIC_BASE_URL=https://your-domain.com
```

S3/R2：

```bash
CANVAS_ASSET_STORAGE_DRIVER=s3
CANVAS_ASSET_PUBLIC_BASE_URL=https://cdn.example.com
CANVAS_ASSET_S3_ENDPOINT=
CANVAS_ASSET_S3_REGION=auto
CANVAS_ASSET_S3_BUCKET=
CANVAS_ASSET_S3_ACCESS_KEY_ID=
CANVAS_ASSET_S3_SECRET_ACCESS_KEY=
```

R2 使用同一组 S3 兼容配置：

```bash
CANVAS_ASSET_STORAGE_DRIVER=r2
```

## 记忆向量

默认配置：

```bash
CANVAS_MEMORY_EMBEDDING_DRIVER=local
```

本地 driver 使用 hash 向量，不依赖外部模型，适合开发和早期部署。

如需接真实 embedding 服务：

```bash
CANVAS_MEMORY_EMBEDDING_DRIVER=model_gateway
CANVAS_MEMORY_EMBEDDING_PROVIDER_TYPE=openai_compatible
CANVAS_MEMORY_EMBEDDING_BASE_URL=https://your-embedding-provider/v1
CANVAS_MEMORY_EMBEDDING_API_KEY=
CANVAS_MEMORY_EMBEDDING_MODEL=
```

当前支持 `openai` 和 `openai_compatible`。真实向量会写入 `CanvasMemory.embedding`，但还没有使用 pgvector 索引。

切换 driver 或模型后，可以对项目记忆刷新向量：

```bash
curl -X POST https://your-domain.com/api/canvas/projects/$PROJECT_ID/memories/refresh-embeddings \
  -H "Cookie: creativeos_sid=..." \
  -H "Content-Type: application/json" \
  -d '{"limit":100}'
```

## 初始化

```bash
npm install
npm run prisma:generate
npm run db:push
npm run build
npm run start
```

应用启动端口为 `3210`。

## 定时任务

清理未引用资产文件：

```bash
curl -X POST https://your-domain.com/api/canvas/assets/cleanup \
  -H "Authorization: Bearer $CANVAS_CLEANUP_TOKEN"
```

执行后台任务：

```bash
curl -X POST https://your-domain.com/api/canvas/tasks/run \
  -H "Authorization: Bearer $CANVAS_TASK_WORKER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"limit":3}'
```

建议频率：

- 任务执行：每 1 分钟一次。
- 资产清理：每天 1 次。

## 模型凭据

模型设置页里的供应商默认只保存在浏览器。

需要后台任务可重试时，用户必须在模型设置页点击“保存到服务端”。服务端只保存加密后的 API Key，后台任务 payload 只保存凭据 id。

## 当前限制

- 数据库 schema 使用 `db:push`，还没有迁移文件流程。
- 记忆检索已使用本地或模型网关 embedding 参与排序，但还没有 pgvector / 向量索引。
- S3/R2 driver 需要用真实云账号做端到端验证。
