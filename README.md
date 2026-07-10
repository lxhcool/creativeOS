# CreativeOS

CreativeOS 是一个画布优先的 AI 资产工作台。用户在画布中输入创作意图，系统通过 planner 判断是回答问题、追问、生成资产、修改资产还是执行导出/整理类操作。生成结果会沉淀为画布节点和可导出资产。

## 功能说明

- 账号密码登录和注册。
- 登录后创建、保存、删除画布项目。
- 画布项目、保存历史、任务、记忆和模型凭据保存到 PostgreSQL。
- 图片、视频、音频和文本节点管理。
- 意图驱动的资产生成：
  - 图片资产链
  - 视频资产链
  - 文章、角色、剧本、分镜资产链
  - 小说基础资产、章节生成、章节更新和小说增量合并链
- 资产面板、单资产导出和资产包导出。
- 项目记忆、章节记忆提取、文本资产记忆提取和后台任务接口。
- 本地文件存储与 S3/R2 兼容对象存储配置。
- Sprite / 视频抠图功能保留。

## 目录结构

```text
.
├── src               # 源代码目录，遵循 Next.js 的 src/app 约定
├── docs              # 项目文档
├── assets            # 数字原始资产分类目录
├── prisma            # Prisma schema
├── scripts           # 本地脚本
├── public            # 静态资源和本地上传公开目录
├── README.md         # 项目说明
└── 其他配置文件
```

## 本地开发

1. 安装依赖：

```bash
npm install
```

2. 准备环境变量：

```bash
cp .env.example .env
```

至少需要配置：

- `DATABASE_URL`
- `AUTH_SESSION_SECRET`
- `MODEL_CREDENTIAL_ENCRYPTION_KEY`

3. 启动 PostgreSQL。可使用本机服务，也可参考 `docker-compose.yml`。

4. 同步数据库结构：

```bash
npm run db:push
```

5. 启动开发服务：

```bash
npm run dev
```

开发地址固定为：

```text
http://127.0.0.1:3210
```

## 常用命令

```bash
npm run dev
npm run typecheck
npm run lint
npm run build
npm run start
npm run prisma:generate
npm run db:push
```

## 部署方式

部署前需要准备：

- Node.js 运行环境
- PostgreSQL 数据库
- `AUTH_SESSION_SECRET`
- `MODEL_CREDENTIAL_ENCRYPTION_KEY`
- 生产模型服务配置
- 可选的 S3/R2 兼容对象存储
- 定时任务调用后台 worker 和资产清理接口

生产构建：

```bash
npm run build
npm run start
```

更完整的部署环境变量、对象存储、cron 和备份说明见：

- `docs/deployment.md`

## 资产目录

`assets/` 用于管理项目相关原始数字资产，例如设计稿、参考图、产品素材和导出样例。运行时用户上传文件默认不提交仓库，相关目录已通过 `.gitignore` 过滤。

## 版本管理

提交信息采用规范化提交格式，例如：

```text
feat: 新增画布资产导出
fix: 修复登录状态恢复
docs: 更新部署说明
refactor: 拆分画布组件
```
