# CreativeOS 自由画布能力扩展架构方案

## 1. 背景

CreativeOS 当前首页提供两个核心入口：

- 自由画布：`/canvas`
- Sprite 资产处理：`/sprite-video`

当前自由画布已经不是单纯绘图工具，而是一个多模态创作空间。它支持文本、图片、视频、音频、形状节点，用户可以在画布中拖拽、连线、输入 prompt，并通过 AI 生成新的素材节点。

当前 Sprite 资产处理是一个独立工具页。它支持导入视频、GIF、图片或图片序列，进行抽帧、去背景、绿幕抠图、边缘修正、帧选择、MAGIC 处理和导出。

后续目标不是把 Sprite 页面直接嵌入画布，也不是把画布改造成某一个垂直行业工具，而是把 Sprite 这类能力拆成可复用的处理能力，让画布中的素材节点可以继续被加工、转换、生成和导出。

## 2. 产品定位

自由画布的定位应保持通用：

```text
自由画布 = 通用多模态创作空间
节点 = 素材或中间结果
连线 = 上下文关系或来源关系
动作 = 对节点执行生成、编辑、转换、导出
结果 = 新节点，继续参与后续创作
```

不同用户会用同一个画布完成不同工作：

- 设计师：图片、参考图、海报、视觉方案、品牌素材
- 视频创作者：脚本、分镜、视频片段、音频、封面、透明素材
- 游戏开发者：角色设定、场景图、动作视频、Sprite 序列、UI 图标
- 内容创作者：文案、素材图、短视频、配音、封面

因此，Sprite、图片滤镜、Prompt 辅助、视频截图、文本改写都不应该成为画布核心的硬编码功能，而应该作为能力扩展接入。

## 3. 设计目标

### 3.1 核心目标

建立一套通用能力扩展机制，使画布可以持续接入新的素材处理能力。

这套机制需要支持：

- 根据节点类型展示可用动作
- 动作可以本地执行、调用后端、调用模型、调用外部工具或调用 Agent
- 动作可以有参数、有进度、有错误、有结果
- 动作执行后生成新节点，并保留来源关系
- 结果节点可以继续作为后续动作的输入
- 能力可以逐步拆分，不破坏现有独立页面

### 3.2 非目标

第一阶段不做以下事情：

- 不把 `/sprite-video` 的完整 UI 搬进画布
- 不把画布改成游戏专用工作台
- 不一次性重构所有画布数据模型
- 不一次性迁移 Sprite 页面所有高级参数
- 不把 skill、滤镜、Sprite 设计成固定特权模块

## 4. 当前代码理解

### 4.1 自由画布

主要文件：

- `src/app/canvas/page.tsx`
- `src/widgets/free-canvas/ui/FreeCanvas.tsx`
- `src/widgets/free-canvas/lib/useCanvasDocument.ts`
- `src/entities/canvas/model/types.ts`
- `src/entities/canvas/lib/factory.ts`
- `src/entities/canvas/lib/workflow.ts`
- `src/features/canvas-brain/*`

当前画布元素类型：

```ts
type CanvasElementKind =
  | "text"
  | "shape"
  | "image"
  | "video"
  | "audio";
```

当前画布已经具备：

- 节点创建、拖拽、选择、删除
- 节点连线
- 视图缩放和平移
- 撤销/重做
- 图片、视频、音频导入
- JSON 导入导出
- PNG 导出
- 节点编辑面板
- 画布 AI 助手
- 根据上下文生成文本、图片、视频结果节点

### 4.2 Sprite 资产处理

主要文件：

- `src/app/sprite-video/page.tsx`
- `src/features/sprite-video-lab/SpriteVideoLab.tsx`
- `src/features/sprite-video-lab/api.ts`
- `src/features/sprite-video-lab/types.ts`
- `src/app/api/sprite-video/[...path]/route.ts`
- `src/server/sprite-worker.ts`
- `tools/sprite-video-lab/server.py`

当前 Sprite 能力包括：

- 上传视频、GIF、图片、图片序列
- 单帧预览
- 视频抽帧
- 透明背景输出
- 绿幕抠图
- luma 抠图
- CorridorKey 抠图
- AI matte 抠图
- 去绿边、淡化绿边、半透明修正
- 批处理帧
- 帧选择和动画预览
- MAGIC 版本生成
- 导出帧序列、GIF、WebM、MOV
- 线稿清理模式

当前 Sprite 页面是完整工具台，但底层能力可以被拆出来复用。

## 5. 成熟框架参考

### 5.1 Blender / Unreal Blueprint / ComfyUI

这些系统的共同点：

- 节点表示数据、操作或中间结果
- 连线表示输入输出关系
- 每个节点有参数和执行状态
- 结果可以继续进入下一个节点

对 CreativeOS 的启发：

```text
不要为每个功能写特殊 UI 流程。
应该抽象出节点、动作、执行、结果、来源关系。
```

### 5.2 Photoshop / Lightroom

这些系统的共同点：

- 原始素材保留
- 编辑动作可以形成新版本
- 滤镜、预设、调整参数可以复用

对 CreativeOS 的启发：

```text
画布动作默认不破坏原节点。
动作结果应生成新节点，或至少保留历史和来源。
```

### 5.3 VS Code / Figma

这些系统的共同点：

- 核心应用只定义扩展点
- 具体能力通过 command、plugin、action 注册
- UI 可以根据上下文展示可用命令

对 CreativeOS 的启发：

```text
画布核心不关心具体能力。
能力通过注册表声明输入类型、输出类型、参数和执行器。
```

### 5.4 LangChain / Workflow Engine

这些系统的共同点：

- 一次任务可以分成上下文准备、工具选择、执行、结果解析
- 可以在执行前后插入辅助逻辑

对 CreativeOS 的启发：

```text
Skill、Agent、Prompt 辅助不应写死。
它们应该是动作执行链路中的可插拔辅助层。
```

## 6. 总体架构

建议把画布演进为以下分层：

```text
Canvas Core
  管节点、连线、选择、拖拽、视图、历史、基础导入导出

Capability System
  注册不同节点类型可用的动作

Action Runtime
  管动作执行、参数、进度、错误、取消、结果

Assistant Middleware
  可选辅助层，用于上下文增强、prompt 改写、参数推荐、结果整理

Artifact Layer
  管真实素材内容，例如图片、视频、文本、序列、文件包

Provenance Layer
  记录结果来源：输入节点、动作、参数、模型、工具、时间
```

第一阶段可以不一次性完整实现所有层，但代码设计应朝这个方向演进。

## 7. 核心概念

### 7.1 Canvas Core

Canvas Core 只负责画布基础能力：

- 节点坐标、尺寸、旋转
- 节点选择和拖拽
- 连线
- 缩放和平移
- 历史记录
- 基础导入导出

Canvas Core 不应该知道：

- Sprite 如何抠图
- 图片滤镜怎么实现
- 某个模型 API 怎么调用
- 某个 skill 如何改写 prompt

### 7.2 Artifact

建议逐步把“画布节点”和“真实素材”分离。

当前 `CanvasElement` 既保存画布位置，也保存 `src`、`text`、`label` 等内容。短期可以继续这样做，但长期建议引入 `Artifact`：

```ts
type ArtifactType =
  | "text"
  | "image"
  | "video"
  | "audio"
  | "sequence"
  | "json"
  | "asset_pack";

interface Artifact {
  id: string;
  type: ArtifactType;
  uri?: string;
  content?: string;
  files?: ArtifactFile[];
  metadata?: Record<string, unknown>;
  provenance?: ArtifactProvenance;
}
```

画布节点只引用资产：

```ts
interface CanvasElementBase {
  id: string;
  kind: CanvasElementKind;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  artifactId?: string;
  status?: CanvasGenerationStatus;
}
```

短期可以先不引入完整 Artifact Store，但新增类型时要避免把复杂结果全部塞进 UI 组件状态。

### 7.3 Template Element 和渲染策略

除了文本、图片、视频、音频这类基础素材节点，画布还需要一种更通用的固定模板节点：

```text
template
```

`template` 不是某一种具体资产，而是一个“固定展示/交互模板”的承载节点。它适合展示结构更复杂的资产，例如：

- 序列帧播放器
- Sprite 动画预览
- 前后对比面板
- 资产包预览
- Prompt 卡片
- 参数化生成面板
- 多图拼接结果
- 未来其他固定布局组件

因此建议区分：

```text
sequence = 资产类型，表示一组帧数据
template = 画布元素类型，表示用某个模板展示某份资产
```

这样后续不需要为每一种复杂展示新增一个 `CanvasElementKind`。画布核心只认识 `template`，具体怎么展示由模板策略决定。

示意类型：

```ts
interface CanvasTemplateElement extends CanvasElementBase {
  kind: "template";
  templateId: string;
  title?: string;
  artifactId?: string;
  props?: Record<string, unknown>;
}
```

模板使用策略模式组织。每个模板一个文件，自己声明如何创建、渲染、编辑和提供动作：

```ts
interface CanvasTemplateStrategy {
  id: string;
  label: string;
  supportedArtifactTypes: ArtifactType[];
  createElement(params: {
    artifactId?: string;
    position: Position;
    props?: Record<string, unknown>;
  }): CanvasTemplateElement;
  getDefaultSize(params?: {
    artifact?: Artifact;
    props?: Record<string, unknown>;
  }): { width: number; height: number };
  render(params: {
    element: CanvasTemplateElement;
    artifact?: Artifact;
    selected: boolean;
  }): React.ReactNode;
  renderEditor?(params: {
    element: CanvasTemplateElement;
    artifact?: Artifact;
    onChange: (updates: Partial<CanvasTemplateElement>) => void;
  }): React.ReactNode;
  getActions?(params: {
    element: CanvasTemplateElement;
    artifact?: Artifact;
  }): CanvasActionDefinition[];
}
```

建议目录结构：

```text
src/widgets/free-canvas/templates/
  registry.ts
  sequence-viewer.tsx
  before-after-compare.tsx
  asset-pack-preview.tsx
```

其中第一阶段只需要实现：

```text
sequence-viewer.tsx
```

它负责展示 `sequence` artifact，例如播放帧动画、显示帧数、帧率、透明背景棋盘格和导出入口。

这个设计的价值：

- 画布核心不需要不断增加渲染分支
- 每个模板的 UI、编辑器、动作可以独立维护
- 新增模板只需要新增策略文件并在 registry 注册
- 同一种资产可以用不同模板展示
- `sequence`、`asset_pack`、`json` 等复杂资产都能复用同一机制

### 7.4 Processor Element 和处理策略

复杂动作不应该只是一键按钮。对于抠图、裁剪、高清、滤镜、抽帧这类参数较多、需要反复调整的能力，画布需要一种参数化处理节点：

```text
processor
```

`processor` 表示一个可重新执行的处理步骤。它不是最终素材，而是连接源素材和结果素材的中间环节。

示例链路：

```text
视频素材节点
  -> 抠图处理节点
  -> sequence-viewer 模板节点
```

示意类型：

```ts
interface CanvasProcessorElement extends CanvasElementBase {
  kind: "processor";
  processorId: string;
  title: string;
  sourceIds: string[];
  resultIds?: string[];
  config: Record<string, unknown>;
}
```

Processor 也应使用策略模式组织，每个处理器一个文件：

```text
src/widgets/free-canvas/processors/
  registry.ts
  video-transparent-sequence.tsx
  video-crop.tsx
  image-filter.tsx
```

第一阶段可以先把处理器渲染和参数面板做成最小实现，后续再拆出完整 processor registry。

`template` 和 `processor` 的区别：

```text
template = 展示结果
processor = 调参数并重新生成结果
```

例如：

```text
video-transparent-sequence processor
  保存抠图参数、执行 Sprite 处理、更新 sequence-viewer

sequence-viewer template
  展示处理结果、播放帧序列、导出
```

### 7.5 Capability

Capability 是“某类能力”的声明。

例如：

- 图像处理能力
- 视频处理能力
- 文本处理能力
- 序列导出能力
- 外部工具能力

Capability 不一定直接显示给用户，它更像能力包。

### 7.6 Action

Action 是用户可以对节点执行的具体动作。

示意结构：

```ts
type CanvasActionCategory =
  | "generate"
  | "edit"
  | "transform"
  | "extract"
  | "export"
  | "organize";

interface CanvasActionDefinition {
  id: string;
  label: string;
  description?: string;
  category: CanvasActionCategory;
  inputKinds: CanvasElementKind[];
  outputKind?: CanvasElementKind;
  outputTemplateId?: string;
  outputArtifactType?: ArtifactType;
  defaultConfig?: Record<string, unknown>;
  configSchema?: unknown;
  supportsPreview?: boolean;
  executorId: string;
}
```

例如 `video.toTransparentSequence` 可以声明：

```ts
const videoToTransparentSequenceAction: CanvasActionDefinition = {
  id: "video.toTransparentSequence",
  label: "生成透明序列",
  category: "transform",
  inputKinds: ["video"],
  outputKind: "template",
  outputArtifactType: "sequence",
  outputTemplateId: "sequence-viewer",
  executorId: "sprite.videoToTransparentSequence",
};
```

这表示动作本身产出的是 `sequence` 数据，但画布上新增的是一个 `template` 节点，并用 `sequence-viewer` 策略展示。

动作示例：

```text
image.applyPreset
image.removeBackground
image.upscale
image.compose
image.generateVariation

video.extractFrame
video.extractFrames
video.removeBackground
video.toTransparentSequence
video.toGif

text.rewrite
text.expand
text.toPrompt
text.toStoryboard

sequence.preview
sequence.exportFrames
sequence.exportGif
sequence.exportSpriteSheet
```

这些只是示例。架构重点是动作可注册，而不是固定这些动作。

### 7.7 Executor

Executor 负责真正执行动作。

可以分为：

```text
local executor
server executor
model executor
external tool executor
agent executor
```

示例：

- 图片普通滤镜：local executor
- Sprite 绿幕抠图：server executor
- 图片生成：model executor
- 视频生成：model executor
- 调 Godot/Unity/FFmpeg：external tool executor
- 多步骤自动规划：agent executor

Action Registry 只知道某个动作对应哪个 executor，不关心执行细节。

### 7.8 Assistant Middleware

用户提到的 skill 辅助、prompt 辅助、工作流辅助，都应该归入更泛化的 Assistant Middleware。

它不是必须层，也不是固定叫 skill。它可以在动作执行前后介入：

```ts
interface ActionMiddleware {
  id: string;
  label: string;
  supportsActions?: string[];
  beforeRun?(context: ActionContext): Promise<ActionContext>;
  afterRun?(context: ActionContext, result: ActionResult): Promise<ActionResult>;
}
```

可能用途：

- 根据用户身份或场景补充 prompt
- 推荐模型
- 推荐动作参数
- 检查输入素材是否满足要求
- 把文本节点整理成结构化上下文
- 生成结果标签和说明
- 自动创建后续建议动作

示例：

```text
像素艺术辅助
  作用于 image.generate、video.generate、sequence.export
  补充 limited palette、clear silhouette、pixel art 等约束

游戏角色辅助
  作用于 video.generate、video.toTransparentSequence
  推荐纯色背景、固定镜头、循环动作、短时长

品牌视觉辅助
  作用于 image.generate、image.applyPreset
  补充品牌色、字体气质、构图约束
```

这里的重点是：辅助能力可插拔，不和某个具体功能绑定。

### 7.9 ActionRun

每次执行动作都应有运行记录：

```ts
type ActionRunStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

interface ActionRun {
  id: string;
  actionId: string;
  executorId: string;
  sourceElementIds: string[];
  sourceArtifactIds?: string[];
  targetElementId?: string;
  resultElementIds?: string[];
  config: Record<string, unknown>;
  middlewareIds?: string[];
  status: ActionRunStatus;
  progress?: number;
  message?: string;
  error?: string;
  startedAt: string;
  finishedAt?: string;
}
```

ActionRun 的价值：

- 用户知道结果从哪里来
- 可以复用参数
- 可以重新执行
- 可以调试失败
- 后续可以做可视化处理节点

第一阶段可以只在前端状态中保存，后续再持久化。

## 8. 节点类型演进

当前已有：

```text
text
shape
image
video
audio
```

建议第一阶段新增：

```text
template
processor
```

`template` 用来承载固定模板。复杂展示不直接新增独立节点类型，而是通过 `templateId` 选择具体策略。

`processor` 用来承载参数化处理步骤。复杂动作不直接一键生成终态，而是创建处理节点，允许用户调整参数并重新生成。

第一阶段建议新增的第一个模板：

```text
templateId: "sequence-viewer"
```

它展示的资产类型是：

```text
ArtifactType: "sequence"
```

`sequence` 表示一组有序帧，可以用于：

- 视频抽帧结果
- 透明帧序列
- Sprite 动画
- GIF 拆帧
- 图片序列动画
- 其他帧资产

建议不要第一版就把节点类型命名为 `sprite` 或 `sequence`，因为这些更像资产类型或展示内容，不应该膨胀画布核心节点类型。Sprite 可以是 `sequence` artifact 的一种用途或 metadata。

示意类型：

```ts
interface CanvasTemplateElement extends CanvasElementBase {
  kind: "template";
  templateId: "sequence-viewer" | string;
  title?: string;
  artifactId?: string;
  props?: {
    fps?: number;
    background?: "checkerboard" | "solid";
    previewFrameIndex?: number;
  };
}

interface SequenceArtifact extends Artifact {
  type: "sequence";
  frames: SpriteFrame[];
  frameCount: number;
  fps?: number;
  jobId?: string;
  exportResult?: SpriteExport;
  sourceMediaType?: "video" | "image" | "image_sequence" | "animation";
  metadata?: {
    transparent?: boolean;
    assetRole?: string;
    animationName?: string;
  };
}
```

实际落地时，`SequenceArtifact` 不一定要马上完整引入为独立 store；第一阶段也可以把这些字段临时放在 `CanvasTemplateElement.props` 中。但模型方向应保持清楚：

```text
template element = 画布上的展示容器
sequence artifact = 帧序列数据
sequence-viewer strategy = 如何展示和编辑这组帧
```

游戏开发相关字段可以后续通过 metadata 扩展，不要写死在第一版核心类型中。

## 9. 用户交互设计

### 9.1 选中节点后的编辑面板

当前节点编辑面板主要是文本、prompt、模型和生成按钮。后续建议拆成几个区域：

```text
基础内容
生成设置
可用动作
来源记录
导出
```

不同节点展示不同动作。

素材节点的常用动作优先放在节点上方工具条中，底部输入框和原来的节点编辑面板继续承担自由创作输入，不被工具按钮挤占。

视频节点工具条示例：

```text
拉片复刻 | 高清 | 裁剪 | 抠图 | 更多
```

点击工具条中的复杂动作时，优先创建或打开对应 processor 节点，而不是把所有参数塞进视频节点本身。

图片节点示例：

```text
生成变体
编辑图片
应用预设
去背景
放大
拼接
导出
```

视频节点示例：

```text
生成变体
截图
抽帧
去背景
生成透明序列
转 GIF
打开高级工具
```

文本节点示例：

```text
扩写
改写
转图片提示词
转视频提示词
生成分镜
整理结构
```

sequence-viewer 模板节点示例：

```text
播放预览
调整帧率
导出帧序列
导出 GIF
导出 WebM
生成 Sprite Sheet
继续处理
```

### 9.2 动作参数

轻量动作可以直接在节点面板中展开参数。

复杂动作有两种选择：

1. 弹出轻量配置面板
2. 跳转到独立高级工具页

Sprite 第一阶段在画布内只暴露常用参数：

- 抽帧间隔
- 输出缩放
- 是否透明背景
- 抠图方式
- 背景色自动/手动
- 去绿边强度

高级参数仍保留在 `/sprite-video`。

### 9.3 结果节点生成方式

默认不覆盖原节点，而是生成新节点：

```text
源节点 -> 结果节点
```

例如：

```text
视频节点 -> 透明序列模板节点
图片节点 -> 滤镜结果图片节点
文本节点 -> 改写结果文本节点
```

这样更符合自由画布的思维，也更容易追溯。

## 10. Sprite 能力接入方案

### 10.1 保留独立 Sprite 页面

`/sprite-video` 继续作为完整高级工具存在。

它适合：

- 手动导入素材
- 精细调参
- 单帧预览
- 批量处理
- MAGIC
- 线稿清理
- 多格式导出

画布不应该复制这个完整 UI。

### 10.2 拆分可复用服务

建议新增：

```text
src/features/sprite-video-lab/defaults.ts
src/features/sprite-video-lab/service.ts
src/features/sprite-video-lab/executors/videoToTransparentSequence.ts
src/features/sprite-video-lab/executors/sequenceExport.ts
```

职责：

```text
api.ts
  保留底层 spriteApi、spriteAssetUrl、downloadUrl 等

types.ts
  保留 SpriteUpload、SpriteJob、SpriteFrame、SpriteExport、ProcessingOptions 等

defaults.ts
  提供默认处理参数，例如 DEFAULT_SPRITE_PROCESSING_OPTIONS

service.ts
  封装 upload、preview、process、export、magic 等函数

executors/*
  适配画布 Action Runtime
```

示意服务函数：

```ts
async function uploadSpriteMedia(file: File): Promise<SpriteUpload>;

async function processSpriteMedia(params: {
  uploadId: string;
  options: ProcessingOptions;
}): Promise<SpriteJob>;

async function exportSpriteSequence(params: {
  jobId: string;
  selectedIndices: number[];
  videoDurationMs: number;
}): Promise<SpriteExport>;
```

### 10.3 画布内第一批 Sprite 动作

第一阶段只做一个核心动作：

```text
video.toTransparentSequence
```

用户流程：

```text
选中视频节点
点击「生成透明序列」
画布创建结果占位节点
上传视频到 Sprite worker
调用 /process
生成 sequence artifact
创建 sequence-viewer 模板节点
自动连线 video -> template
模板节点可播放帧预览
模板节点可导出
```

### 10.4 为什么先做这个动作

它能验证完整架构：

- 输入是现有 video 节点
- 执行器是 server executor
- 后端复用现有 Sprite worker
- 输出是新增 sequence artifact 和 sequence-viewer 模板节点
- 结果可以预览和导出
- 独立 Sprite 页面不受影响

## 11. 其他能力如何接入

下面不是固定功能清单，而是说明架构如何扩展。

### 11.1 图片处理类能力

可以接入：

- 本地滤镜
- AI 风格化
- 去背景
- 放大
- 裁剪
- 拼接
- 生成变体

统一表达为：

```text
image action
```

本地滤镜可以通过 Canvas/WebGL 执行，AI 风格化可以走模型执行器。

### 11.2 文本处理类能力

可以接入：

- 改写
- 扩写
- 总结
- 翻译
- 转 prompt
- 转分镜
- 转结构化设定

统一表达为：

```text
text action
```

它可以继续使用当前 canvas-brain，也可以拆成更通用的 text executor。

### 11.3 视频处理类能力

可以接入：

- 截图
- 抽帧
- 去背景
- 转透明序列
- 转 GIF/WebM
- 转封面图
- 视频裁剪
- 视频拼接

统一表达为：

```text
video action
```

Sprite 是视频处理能力的一部分，但不是全部。

### 11.4 辅助能力

用户未来可能加入各种辅助能力，例如：

- Prompt 优化
- 风格约束
- 行业模板
- 游戏资产规范
- 品牌规范
- 分镜辅助
- 质量检查
- 自动标签
- 自动推荐下一步

这些不应该作为固定模块，而应该作为 middleware 接入动作执行链路。

## 12. Action Runtime 执行流程

建议标准流程：

```text
1. 用户选择节点
2. Action Registry 根据节点类型返回可用动作
3. 用户选择动作并配置参数
4. Runtime 创建 ActionRun
5. Middleware beforeRun 增强上下文或参数
6. Executor 执行动作
7. Runtime 接收结果
8. Middleware afterRun 整理结果
9. 创建结果 Artifact
10. 创建结果 CanvasElement
11. 创建来源连线
12. 更新 ActionRun 状态
```

伪代码：

```ts
async function runCanvasAction(params: {
  actionId: string;
  sourceElementIds: string[];
  config: Record<string, unknown>;
  middlewareIds?: string[];
}) {
  const action = actionRegistry.get(params.actionId);
  const run = actionRunStore.create(params);

  let context = buildActionContext(action, params);
  context = await applyBeforeRunMiddleware(context);

  const executor = executorRegistry.get(action.executorId);
  let result = await executor.run(context);

  result = await applyAfterRunMiddleware(context, result);

  const resultElements = createResultElements(result);
  commitCanvasWithResultNodes(resultElements);

  actionRunStore.complete(run.id, resultElements);
}
```

## 13. 和现有 canvas-brain 的关系

当前 `canvas-brain` 负责：

- 根据用户自然语言理解意图
- 选择或创建目标节点
- 调用文本、图片、视频生成
- 把结果放回画布

后续不建议直接废弃它，而是逐步把它变成 Action Runtime 的一种入口。

关系可以是：

```text
用户直接点按钮
  -> Action Runtime

用户输入自然语言
  -> canvas-brain 规划 actionId + sourceIds + config
  -> Action Runtime
```

也就是说，AI 助手不直接写死执行逻辑，而是负责把自然语言转成标准动作。

示例：

```text
用户说：“把这个视频抠成透明序列”

canvas-brain 输出：
actionId: video.toTransparentSequence
sourceIds: [selectedVideoId]
config: { matteMode: "chroma", canvasMode: "auto" }
```

然后由 Action Runtime 执行。

## 14. 数据持久化策略

第一阶段可以继续使用前端状态和现有 JSON 导出。

但 JSON 结构应考虑扩展：

```ts
interface CanvasProjectExport {
  version: "1.0.0" | "2.0.0";
  exportedAt: string;
  viewport: CanvasViewport;
  elements: CanvasElement[];
  edges: CanvasEdge[];
  artifacts?: Artifact[];
  actionRuns?: ActionRun[];
}
```

兼容策略：

- 旧 JSON 没有 `artifacts` 和 `actionRuns` 时仍可导入
- 新增字段可选
- `sequence` 节点导入时校验 frames 和 URL

## 15. 推荐实施阶段

### 阶段 0：文档和边界确认

目标：

- 确认自由画布定位
- 确认 Sprite 作为能力接入，不替代独立页面
- 确认第一阶段最小闭环

产出：

- 本方案文档
- 第一阶段任务列表

### 阶段 1：Sprite 服务拆分

目标：

- 不改 UI 行为
- 从 `SpriteVideoLab.tsx` 抽出可复用服务函数和默认参数

任务：

- 新增 `defaults.ts`
- 新增 `service.ts`
- 保持 `SpriteVideoLab.tsx` 使用这些服务
- 确认 `/sprite-video` 原功能不变

验收：

- 独立 Sprite 页面仍能上传、预览、处理、导出

### 阶段 2：画布新增 template 类型和 sequence-viewer 模板

目标：

- 画布可以用固定模板表达帧序列结果，并为后续更多模板预留扩展方式

任务：

- 扩展 `CanvasElementKind`
- 新增 `CanvasTemplateElement`
- 新增 factory
- 新增模板策略 registry
- 新增 `sequence-viewer` 模板策略文件
- 支持简单动画预览
- 支持 JSON 导入导出

验收：

- 能在画布上显示 sequence-viewer 模板节点
- 能播放帧预览
- 能被选中、拖拽、删除、连线

### 阶段 3：引入轻量 Action Registry

目标：

- 不一次性大重构
- 先建立可注册动作的最小结构

任务：

- 新增 `canvas-actions` feature
- 定义 `CanvasActionDefinition`
- 定义 `CanvasActionExecutor`
- 提供 `getActionsForElement(element)`
- 先注册 `video.toTransparentSequence`

验收：

- 选中视频节点时，面板可展示“生成透明序列”

### 阶段 4：视频到透明序列闭环

目标：

- 画布视频节点调用 Sprite 后端生成 sequence artifact 和 sequence-viewer 模板节点

任务：

- 从视频节点读取 `src`
- 将 data URL 转成 File 或 Blob
- 调用 Sprite upload
- 调用 Sprite process
- 创建 sequence artifact
- 创建 sequence-viewer 模板节点
- 创建 video -> template 连线
- 模板节点显示处理状态和错误

验收：

- 用户导入或生成视频后，可以一键生成透明帧序列
- 结果出现在画布中
- 原视频节点保留
- 独立 Sprite 页面不受影响

### 阶段 5：sequence-viewer 导出动作

目标：

- sequence-viewer 模板节点可以导出

任务：

- 注册 `sequence.exportFrames`
- 注册 `sequence.exportGif` 或复用 Sprite export
- 在节点面板展示导出入口

验收：

- sequence-viewer 模板节点可以导出帧序列、GIF/WebM/MOV 中至少一种

### 阶段 6：抽象 Assistant Middleware

目标：

- 为未来 skill、prompt 辅助、参数推荐预留扩展点

任务：

- 定义 middleware 接口
- 支持动作执行前修改 config/prompt/context
- 支持动作执行后补充说明和 metadata
- 先不做复杂 UI，只保留内部结构

验收：

- 某个动作可以通过 middleware 修改参数后再执行

## 16. 风险和注意事项

### 16.1 不要过早大重构

Artifact Store、Action Runtime、Middleware 都是目标架构，但第一阶段不应一次性全量重写。建议以 Sprite 接入为牵引，逐步抽象。

### 16.2 不要把 Sprite UI 直接搬进画布

Sprite 独立页复杂度高，适合高级调参。画布内应该只提供轻量动作入口和结果节点。

### 16.3 不要把游戏语义写死

游戏资产是重要场景，但画布应保持通用。`sequence`、`metadata`、`middleware` 比 `gameSpriteCharacterNode` 这种命名更稳。

### 16.4 处理大文件和 data URL

当前画布视频节点可能保存 data URL。Sprite worker 需要上传文件或 Blob。后续要注意：

- 大视频 data URL 会占内存
- JSON 导出包含大 data URL 会很重
- 长期应考虑本地文件存储或对象 URL 管理

### 16.5 异步任务状态

Sprite 处理可能耗时。画布中必须有清楚状态：

- queued
- running
- succeeded
- failed

否则用户会不知道处理是否还在进行。

### 16.6 结果 URL 生命周期

Sprite worker 返回的 `/work/*`、`/media/upload/*` 路径由后端工作目录管理。画布 JSON 导出和长期复用时，要考虑这些文件是否还存在。

第一阶段可以接受本地工作目录依赖，后续再做 artifact 持久化。

## 17. 第一阶段建议任务清单

建议第一批只做这些：

```text
1. 抽出 Sprite service/defaults
2. 新增 template 节点类型和 sequence-viewer 模板
3. 新增轻量 Action Registry
4. 注册 video.toTransparentSequence
5. 在视频节点编辑面板增加动作入口
6. 执行动作后生成 sequence artifact 和模板节点
7. sequence-viewer 模板节点支持预览
8. sequence-viewer 模板节点支持至少一种导出
```

暂不做：

```text
1. 完整 Sprite 参数面板
2. MAGIC 接入画布
3. 线稿清理接入画布
4. 完整 Artifact Store
5. 完整 Skill UI
6. 多动作编排 UI
7. 可视化处理节点
```

## 18. 最终形态

最终 CreativeOS 画布应具备这种能力：

```text
任意素材节点
  -> 可发现动作
  -> 可配置参数
  -> 可被辅助能力增强
  -> 可执行
  -> 可生成结果节点
  -> 可追溯来源
  -> 可继续加工
```

Sprite 是其中一类能力：

```text
视频节点
  -> 抽帧 / 去背景 / 转透明序列 / 导出
  -> sequence artifact
  -> sequence-viewer 模板节点
```

图片处理是另一类能力：

```text
图片节点
  -> 编辑 / 转换 / 风格化 / 导出
  -> 图片节点
```

文本处理也是同一套能力：

```text
文本节点
  -> 改写 / 扩写 / 转 prompt / 转分镜
  -> 文本节点或其他素材节点
```

这样画布不会被任何单一功能绑死，后续无论加入新的模型、新的工具、新的 Agent、新的行业辅助能力，都可以沿同一套架构自然扩展。
