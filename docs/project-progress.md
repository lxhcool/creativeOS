# CreativeOS 项目进度跟踪

更新时间：2026-07-09

## 当前产品方向

CreativeOS 定位为画布资产工作台。

核心原则：

- 画布是主要展现和操作形式。
- 用户进入画布后直接输入意图，不需要先选择小说、图片、视频等流程。
- AI 先做意图判断，再决定回答、追问、生成资产或基于选中节点生成新版本。
- 所有生成结果都应沉淀为可保存、可追溯、可导出的资产。
- 修改默认生成新版本或新节点，不覆盖原资产。
- 自由画布入口后续保留给专业用户。

## 已完成

### 登录与账号

- 去掉邮箱验证码登录流程。
- 登录和注册改为账号密码模式。
- 删除验证码相关组件和接口。

### 画布项目存储

- 画布项目从本地存储改为 PostgreSQL + Prisma。
- 新增 `CanvasProject` 表保存画布 payload。
- 新增 `CanvasSaveHistory` 表保存画布快照。
- 未登录不允许创建、保存、删除画布。
- 首页新建画布直接进入空白画布，不再选择流程类型。
- 开发和启动端口改为 `3210`，不再使用 `3000`。

### 旧流程清理

- 删除旧的固定工作流代码。
- 删除旧小说工作流入口。
- 删除 `/api/canvas/text-workflow`。
- 删除旧助手面板、流程启动条、锚点导航等固定流程 UI。
- 清理用户可见的“小助手”“画布大脑”等旧文案。

### 画布输入与生成

- 画布右下角固定创作输入区。
- 无选中节点时，先判断意图；明确创作才创建资产链，普通问题只回答。
- 选中节点时，输入内容默认基于该节点继续生成新版本。
- 图片生成链路已初步实现：
  - 创作意图
  - 视觉简报
  - 生图提示词
  - 生成图片
- 视频生成链路已初步实现：
  - 创作意图
  - 视频脚本
  - 分镜方案
  - 视频提示词
  - 生成视频
- 文本生成链路已初步实现：
  - 创作意图
  - 文本资产
- 结构化文本资产链已覆盖第一版：
  - 文章：创作意图 -> 文章大纲 -> 文章正文
  - 角色：创作意图 -> 角色简报 -> 角色卡
  - 剧本：创作意图 -> 剧本结构 -> 剧本正文
  - 分镜：创作意图 -> 分镜方案 -> 分镜表
- 小说基础资产图已覆盖第一版：
  - 小说意图
  - 作品定位
  - 世界观简表
  - 角色种子
  - 主线大纲
  - 作品圣经
  - 角色状态表
  - 伏笔台账
- 小说章节资产链已覆盖第一版：
  - 章节意图
  - 章节大纲
  - 章节正文
  - 章节事件摘要
  - 角色状态更新
  - 伏笔更新
- 章节生成会自动参考画布里的小说底座资产：
  - 作品圣经
  - 角色状态表
  - 伏笔台账
  - 主线大纲
  - 世界观、角色种子、连续性记录等相关文本资产
- 参考图支持通过输入区上传，并进入图片生成链路。
- 已修正一个体验偏差：无选中节点的兜底路径不再直接创建文本资产，普通问题会进入 planner 判断。
- 本地资产链关键词判断已收紧，避免“小说流程怎么做”“图片怎么配置”这类咨询被抢跑成生成任务。
- 画布输入区已从 `FreeCanvas.tsx` 抽离为 `CanvasIntentInputPanel`。
- 意图执行分支已从 `FreeCanvas.tsx` 收口到 `useCanvasIntentCommandRunner`，主画布组件不再直接承载图片、视频、小说、结构化文本链路分发。
- 资产定位、单资产导出和资产包导出已从 `FreeCanvas.tsx` 抽离为 `useCanvasAssetExportController`。
- 统一 planner 执行器已移除“找不到目标就创建想法文本素材”的兜底，避免普通或低质量 action 意外写入画布。
- planner schema 已新增 `assetWorkflow`，用于结构化选择图片、视频、小说、章节、文章、角色、剧本、分镜和一致性检查资产链。
- `assetWorkflow` 已支持 `novel_merge_updates`，用于整理章节后的小说增量更新资产。
- 前端提交路径已移除本地关键词抢跑判断，不再先用 `isImageAssetIntentCommand` 等正则决定生成；现在先由 planner 判断，再按 `assetWorkflow` 执行资产链。
- LangGraph 已改为信任 planner 的 `mode=chat` 结果；只有 planner 请求失败时才使用本地 fallback，避免“图片怎么配置”“小说流程怎么做”这类咨询被本地关键词改成生成任务。
- planner 失败时的本地 fallback 已收紧为只处理明确创作/生成/检查请求；纯问题、配置咨询、流程咨询不会 fallback 成画布生成任务。
- 资产链执行已从 `useCanvasIntentCommandRunner` 抽离到 `canvasAssetWorkflowRunner`：
  - `useCanvasIntentCommandRunner` 只负责提交输入、记录对话和 loading 状态。
  - `assistantCommandRunner` 负责调用 planner、处理 chat/clarification/action。
  - `canvasAssetWorkflowRunner` 负责根据 planner 的 `assetWorkflow` 执行多节点资产链。
- 隐藏文件输入和上传 change 事件已从 `FreeCanvas.tsx` 抽离为 `CanvasHiddenFileInputs`，主画布组件不再直接承载 5 个文件 input 的 DOM 细节。
- 文本节点预览浮动按钮已从 `FreeCanvas.tsx` 抽离为 `CanvasTextPreviewButtons`。
- Processor 节点 overlay 和序列模板 overlay 已从 `FreeCanvas.tsx` 抽离为 `CanvasNodeDomOverlays`。
- 选中节点编辑面板和“基于编辑器选项组装生成参数”的逻辑已从 `FreeCanvas.tsx` 抽离为 `CanvasSelectedNodeEditor`。
- 右键菜单、文本预览、保存状态、保存历史、删除/清空确认弹层已从 `FreeCanvas.tsx` 抽离为 `CanvasShellOverlayLayer`。

### 资产系统

- 新增 `CanvasAssetMeta`。
- 生成结果节点会带资产元数据。
- 支持资产状态：
  - `draft`
  - `ready`
  - `exported`
- 首页项目卡片显示资产数量。
- 画布节点显示资产标识。
- 新增资产面板：
  - 查看当前画布资产
  - 定位到资产节点
  - 导出单个资产
- 节点右键菜单支持导出资产。
- 当前导出支持：
  - 文本单资产导出 Markdown / DOCX
  - ZIP 资产包内包含文本 DOCX
  - 图片、视频、音频按 URL 下载
  - 模板、处理器导出 JSON
- 新增画布资产上传 API：
  - `/api/canvas/assets/upload`
  - 上传图片、视频、音频后返回 URL
  - 画布节点保存 URL，不再把新上传媒体直接保存为 data URL
  - local driver 写入 `public/uploads/canvas-assets`
  - s3/r2 driver 写入 S3 兼容对象存储
- 新增 `canvas-asset-storage` 存储层，上传文件、生成 data URL 落盘和文件删除都统一走这一层。
- 新增存储环境变量：
  - `CANVAS_ASSET_STORAGE_DRIVER=local|s3|r2`
  - `CANVAS_ASSET_PUBLIC_BASE_URL`
  - `CANVAS_ASSET_S3_ENDPOINT`
  - `CANVAS_ASSET_S3_REGION`
  - `CANVAS_ASSET_S3_BUCKET`
  - `CANVAS_ASSET_S3_ACCESS_KEY_ID`
  - `CANVAS_ASSET_S3_SECRET_ACCESS_KEY`
- 图片/视频生成接口会把模型返回的 data URL 落成本地文件 URL。
- 新增 `CanvasAssetFile` 表设计，用于记录上传和生成文件：
  - ownerId
  - projectId
  - url
  - storageKey
  - kind
  - mimeType
  - size
  - status
- 删除画布项目时会通过存储层删除该项目关联的资产文件，并把文件记录标记为 `deleted`。
- 保存画布项目时会通过存储层识别 payload 中引用的资产 URL：
  - 被引用的文件标记为 `active`
  - 不再被引用的文件标记为 `unreferenced`
- 已提供 `deleteUnreferencedCanvasAssetFiles` 清理函数，可删除超过保留期的未引用文件并标记为 `deleted`。
- 新增后台清理接口：
  - `POST /api/canvas/assets/cleanup`
  - 通过 `CANVAS_CLEANUP_TOKEN` 保护
  - 可由云服务器 cron 调用

### 意图门控

- planner 增加 `intentType`：
  - `create_asset`
  - `modify_asset`
  - `ask_question`
  - `navigate_canvas`
  - `unclear`
- planner 增加 `confidence`。
- 低置信度或 `unclear` 不执行生成，改为追问。
- 普通问题默认回答，不写入画布。
- 只有明确创建、修改、生成、放入画布时才创建节点。

### 记忆系统

- 新增 `CanvasMemory` 表设计。
- 运行态记忆不是 Markdown 文件，而是数据库 JSON。
- 画布完整事实存在 `CanvasProject.payload`。
- 长期记忆存在 `CanvasMemory.content`。
- 项目 payload 新增 `assistantSession`：
  - 会话摘要
  - 上次焦点节点
  - 更新时间
- 再次进入画布时恢复上次焦点。
- 保存画布时自动同步：
  - 项目资产索引 `project_asset_index`
  - 上次沟通摘要 `project_session_summary`
  - 作品设定类记忆 `project_bible`
  - 角色状态类记忆 `character_state`
  - 连续性类记忆 `continuity`
  - 章节事件摘要 `chapter_event_summary`
- planner 会读取项目记忆辅助意图判断。
- 文本生成 API 会读取项目记忆辅助内容生成。
- 图片意图链里的视觉简报和生图提示词也会读取项目记忆。
- 新增项目记忆 patch 写入 API：
  - `POST /api/canvas/projects/[projectId]/memories`
  - 服务端校验项目归属和记忆 schema
  - 支持写入 `project_bible`、`continuity`、`character_state`、`chapter_event_summary`、`note`
- 章节正文生成后会异步提取章节记忆，不阻塞正文生成完成：
  - 章节事件摘要 `chapter_event_summary`
  - 连续性记录 `continuity`
  - 角色状态 `character_state`
  - 伏笔台账 `note` with `noteType: "foreshadowing"`
- 新增服务端章节记忆提取接口：
  - `POST /api/canvas/projects/[projectId]/memories/extract`
  - 前端章节链路只触发一次服务端提取请求
  - 服务端负责调用文本模型、生成 memory patches 并写入数据库
- 新增 `CanvasTask` 表设计和任务状态记录：
  - `pending`
  - `running`
  - `succeeded`
  - `failed`
  - attempts / maxAttempts / runAfter / error / result
- 章节记忆提取会记录任务状态，成功后写入提取数量和 memory ids。
- 新增项目任务查询接口：
  - `GET /api/canvas/projects/[projectId]/tasks`
- 新增后台任务执行接口：
  - `POST /api/canvas/tasks/run`
  - 通过 `CANVAS_TASK_WORKER_TOKEN` 保护
  - 当前支持执行 `memory_extract:novel_chapter`、`memory_extract:text_asset`
  - 支持领取到期 pending 任务、运行、成功写 result、失败按 attempts/runAfter 重试
- 新增用户级偏好记忆写入 API：
  - `POST /api/canvas/memories/preferences`
  - 写入 `scope=user`、`type=user_preference`
- 新增服务端模型凭据加密存储：
  - `CanvasModelCredential`
  - `GET /api/canvas/model-credentials`
  - `POST /api/canvas/model-credentials`
  - `DELETE /api/canvas/model-credentials/[credentialId]`
  - API Key 使用 AES-256-GCM 加密保存
  - 后台任务 payload 只保存 `providerCredentialId` 和脱敏 provider 信息，不保存明文 API Key
- 模型设置页新增“保存到服务端”动作：
  - 用户明确点击后才会把当前连接的 API Key 写入服务端加密存储
  - 本地 provider 会保存 `serverCredentialId`
  - 删除本地 provider 时会尝试归档对应服务端凭据
- 章节记忆提取接口已支持使用服务端模型凭据运行。
- 前端触发章节记忆提取时会携带 `serverCredentialId`。
- 新增文本资产记忆提取任务：
  - `kind=text_asset`
  - 可从文章、角色、剧本、分镜、小说基础资产中提取作品设定、连续性、角色状态和创作备注
  - 结构化文本链和小说基础资产链生成完成后会非阻塞触发
- 选中文本资产后输入一致性/连续性/矛盾检查类意图，会生成新的“一致性检查”报告节点。
- 未选节点时输入全局一致性/连续性/矛盾检查类意图，会基于画布文本资产生成“全局一致性审计”报告节点。
- 记忆召回已从“最近更新时间”升级为综合排序：
  - 当前输入相关性
  - 焦点节点
  - 记忆类型权重
  - 重要性
  - 置信度
  - 新近度
  - 访问统计
- 记忆表已新增本地语义 embedding 字段：
  - `embedding`
  - `embeddingModel`
  - `embeddingUpdatedAt`
- 当前 embedding 使用本地 hash 向量 `creativeos-local-hash-v1`，用于让召回排序具备第一版语义分数。
- 记忆 embedding 已抽成独立服务层，默认使用本地 hash driver。
- 可通过 `CANVAS_MEMORY_EMBEDDING_DRIVER=model_gateway` 接 OpenAI / OpenAI-compatible embedding 服务。
- 新增项目记忆向量刷新接口：
  - `POST /api/canvas/projects/[projectId]/memories/refresh-embeddings`
  - 用于切换 embedding driver 或模型后刷新项目已有记忆向量
- LangGraph 运行已带稳定 `thread_id`：
  - 已保存画布：`canvas:<projectId>`
  - 未保存画布：`canvas:unsaved`
  - 这只是为后续数据库 checkpointer 铺接口，不等同于已完成持久化 checkpoint
- 这还不是生产级向量检索；pgvector 和向量索引仍是后续工作。

### 保留功能

- Sprite / 视频抠图相关功能保留。

## 当前状态

### 数据库结构已同步

本机 PostgreSQL 已运行，`creativeos` 数据库和用户已存在，Prisma schema 已同步到本地数据库。

已执行并通过：

```bash
npm run prisma:generate
npm run db:push
npm run typecheck
npm run lint
```

说明：

- `npm run typecheck` 已改为 `tsc --noEmit --incremental false`，避免 Prisma schema 变更后读取旧增量缓存。

## 未完成

### 记忆系统

- 已有 embedding 字段和 embedding 相似度排序。
- 还没有 `pgvector` / 向量索引。
- 章节和文本资产记忆提取已从主生成链路拆开，失败不会阻塞正文生成。
- 已有服务端提取接口、任务表、任务状态记录、服务端加密模型凭据和受保护 worker 接口。
- 云服务器部署时需要配置 cron 调用 `/api/canvas/tasks/run`。
- 还没有 LangGraph 数据库 checkpointer。
- 已有用户级偏好记忆写入 API，但还没有从对话中自动抽取用户偏好。

### 资产与文件存储

- 已完成存储 driver 边界、本地上传底座和 S3/R2 兼容对象存储基础 driver。
- S3/R2 driver 还没有用真实云账号做端到端上传、访问和删除验证。
- OSS 或自建文件服务还没有单独适配。
- 需要文件生命周期管理：
  - 在云服务器上配置 cron 调用 `/api/canvas/assets/cleanup`
  - 备份策略
  - 云存储删除失败后的重试队列

### 生成流程

- 文本、图片、视频资产链已有第一版结构化链路，但还需要继续扩展：
  - 小说：意图 -> 作品定位 / 世界观 / 角色 / 主线 / 章节 / 正文
  - 更细的文章、角色、剧本版本化策略
  - 更细的视频镜头版本化、参考图继承和多镜头导出策略
- 这些不应该变成固定流程选择，而是由 AI 根据意图和上下文动态生成。

### 小说长期创作

- 已有第一版小说基础资产图，但还没有完整长篇创作闭环。
- 小说基础资产图已扩展为长期创作底座：作品定位、世界观、角色种子、主线大纲、作品圣经、角色状态表、伏笔台账。
- 已有第一版章节大纲和章节正文生成链路。
- 章节大纲和章节正文会优先参考画布中的作品圣经、角色状态表、伏笔台账、主线大纲和连续性资产，减少角色状态、世界规则、伏笔信息前后冲突。
- 章节正文生成后会继续生成章节事件摘要、角色状态更新和伏笔更新三个增量资产，并写入项目记忆，形成章节后的反向更新闭环。
- 新增小说增量合并链：可把章节事件摘要、角色状态更新、伏笔更新等资产整理成作品圣经补丁、角色状态表更新版和伏笔台账更新版，并写入项目记忆。
- 已有第一版章节完成后的连续性记录更新。
- 已有章节完成后的角色状态、章节事件摘要、连续性记录和伏笔台账细分更新。
- 这些记忆补写已有服务端提取接口、持久任务队列和受保护 worker 重试入口。
- 已有第一版面向选中文本资产的一致性检查报告。
- 已有第一版跨画布文本资产的全局一致性审计报告。
- 还没有问题状态跟踪和一键修订建议应用。

### 导出

- 已支持单资产导出。
  - 文本资产可直接选择 MD / DOCX
  - 媒体资产按 URL 下载
  - 模板/处理器导出 JSON
- 已支持资产包 manifest 导出：
  - 资产列表
  - 资产元数据
  - 文本内容
  - 媒体 URL
  - 画布资产关系
- 已支持 ZIP 资产包导出：
  - `manifest.json`
  - 文本资产 Markdown
  - 文本资产 DOCX
  - 模板/处理器 JSON
  - 同源或 data URL 媒体文件
  - 跨域不可读取媒体会记录在 `media-url-notes.json`
- DOCX 为第一版基础排版，支持标题和普通段落。

### 云部署准备

- 已新增部署说明：`docs/deployment.md`。
- 已整理生产环境变量、对象存储配置、初始化命令和定时任务调用方式。
- 需要备份策略。
- 需要处理上传文件、生成文件和数据库之间的生命周期。

### 代码命名

- 内部仍有部分 `brain` 命名。
- 用户可见文案已清理，但内部长期建议逐步改为 `intent`、`planner`、`assistantSession`、`memory` 等更贴近产品方向的命名。

### 架构审查

- 当前产品方向没有偏离：画布仍是主入口，意图判断决定回答、追问或生成资产。
- 当前最大代码设计债务是 `FreeCanvas.tsx` 仍承担过多职责：画布渲染、项目操作和工具栏装配仍集中在一个组件里；上传 input、文本预览按钮、processor/sequence overlay、选中节点编辑面板、菜单弹层、输入面板、资产导出已拆出。
- 当前最大流程债务已从“前端关键词抢跑”收敛为“planner 已能选择资产链，资产链执行也有独立 runner，但多节点资产链本身仍在客户端执行”。长期应继续把链路编排迁到服务端/统一执行层，前端只负责渲染和调用执行结果。
- LangGraph 已有稳定 `thread_id`，但还没有数据库 checkpointer；再次进入画布主要依靠 `assistantSession` 和 `CanvasMemory`。

## 下一步建议

优先级从高到低：

1. 收敛前端意图分发：把多节点资产链选择从 `FreeCanvas.tsx` 移到 planner / 执行器边界。
2. 用真实 S3/R2 配置验证对象存储上传、访问、删除链路。
3. 接入真实 embedding provider，并用 pgvector / 向量索引替换当前本地 hash embedding。
4. 扩展资产链，让小说、文章、角色、视频都能按意图生成更细的资产图。
5. 做浏览器点击级 UI 验证。

## 当前验证状态

最近一次检查：

```bash
npm run typecheck
npm run lint
AUTH_SESSION_SECRET=local-build-secret-please-change npm run build
```

结果：通过。

HTTP 端到端验证：

- 未登录创建画布返回 401。
- 注册测试用户成功，并写入会话 cookie。
- 登录态创建画布成功。
- 项目列表读取成功。
- 项目详情读取成功，payload 可恢复。
- 保存历史写入和读取成功。
- 项目任务列表读取成功。
- 服务端模型凭据保存、列表、删除成功，列表不返回明文 API Key。

生产构建说明：

- 不设置 `AUTH_SESSION_SECRET` 时，生产构建会按预期失败并提示必须配置会话密钥。
- 设置临时构建密钥后构建通过。
- 当前仍有一个 Turbopack 非阻塞警告，来源是保留的视频抠图内部 worker 路由的文件追踪。

旧流程关键词扫描：

```bash
rg "workflowType|canvas-workflows|text-workflow|小说工作流|小助手|画布大脑" src docs prisma -n
```

结果：源码无命中；仅进度文档中保留已删除项的历史说明。
