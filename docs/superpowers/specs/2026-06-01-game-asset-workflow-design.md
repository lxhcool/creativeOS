# 游戏资产工作流设计

日期：2026-06-01

## 目标

CreativeOS 第一阶段通过一个可编辑的游戏资产工作流来验证 Game Asset Studio，而不是做一个一次性图片生成器。

MVP 用户流程：

```text
用户输入 prompt
-> Dify 规划
-> 校验后的 AgentPlan
-> 本地工具执行
-> 可复用资产
-> 画布节点和连线
-> Canvas2D 预览
-> 项目保存 / 加载
```

第一条生产级工作流先创建角色资产链，支持 `idle`、`walk`、`attack` 动画预览。架构必须同时支持多个角色、可选场景和组合预览，不能把整个游戏的所有内容都塞进一个画布。

## 产品边界

CreativeOS 是个人 AI 无限画布创作工作台。Game Asset Studio 是第一个验证模块。

MVP 包含：

- 一个项目内可以有多条资产工作流。
- 支持角色、骨架、动画、场景、预览和组合预览资产。
- 画布节点引用资产，不在节点内直接存放大体积资产数据。
- 每个工作流阶段都可编辑，并能触发下游失效状态。
- 第一阶段使用 Dify 作为 Agent / Workflow 后端。
- 本地负责 schema 校验和项目状态变更。

MVP 不包含：

- AI 生图。
- Spine 导出。
- Unity 导出。
- 完整游戏运行时逻辑。
- 复杂地图编辑、碰撞、寻路和战斗系统。
- 多人协作。

## 架构

推荐架构是 Dify Planner + Local Tool Executor。

```text
Frontend
-> Agent API
-> AgentProvider
-> DifyAgentProvider
-> AgentPlan JSON
-> Zod validation
-> ToolExecutor
-> AssetStore
-> ProjectStore
-> Board canvas
-> Preview runtime
```

Dify 只负责规划。它不能直接写项目状态、不能直接改数据库、不能直接创建画布节点。CreativeOS 负责所有确定性的状态变更。

## AgentProvider 边界

业务代码只能调用 `AgentProvider`，不能直接依赖 Dify。

```ts
type AgentProvider = {
  runGameAssetPlan(input: GameAssetPlanInput): Promise<AgentPlan>;
};
```

`DifyAgentProvider` 是第一阶段实现。未来可以替换为 LangGraph、本地工作流引擎，或直接基于 Model Gateway 的实现，而不影响资产系统和项目系统。

## AgentPlan Schema

Dify 返回执行计划，不返回完整项目状态。

```json
{
  "version": "1",
  "intent": "create_game_asset_workflow",
  "summary": "Create an archer character with idle, walk, and attack animations.",
  "tools": [
    {
      "name": "createCharacter",
      "input": {
        "kind": "archer",
        "style": "stickman",
        "description": "A simple archer game character"
      }
    },
    {
      "name": "createSkeleton",
      "input": {
        "rig": "humanoid_2d",
        "proportion": "chibi"
      }
    },
    {
      "name": "createAnimation",
      "input": {
        "actions": ["idle", "walk", "attack"]
      }
    },
    {
      "name": "createPreview",
      "input": {
        "runtime": "canvas2d"
      }
    }
  ]
}
```

每个计划必须先校验再执行。未知工具、非法字段、缺少必填输入、不支持的版本，都必须在项目状态变更前失败。

## 本地工具

`createCharacter`

- 创建角色元信息。
- 输出：`CharacterAsset`。
- 示例字段：kind、display name、style、description、tags。

`createSkeleton`

- 为角色创建可复用的 2D 骨架。
- 输出：`SkeletonAsset`。
- 在角色链里依赖一个角色资产。
- 示例字段：joints、bones、proportions、attachment points。

`createAnimation`

- 创建关键帧动画资产。
- 输出：一个或多个 `AnimationAsset`。
- 依赖一个骨架资产。
- MVP 动作：`idle`、`walk`、`attack`。

`createScene`

- 创建简单场景资产。
- 输出：`SceneAsset`。
- MVP 范围：元信息和简单视觉 / 布局表达，不做完整地图编辑。

`createPreview`

- 为一条资产链创建预览资产。
- 输出：`PreviewAsset`。
- MVP 运行时：Canvas2D。

`createCompositionPreview`

- 创建组合预览，把多个角色和 / 或场景组合起来。
- 输出：`CompositionPreviewAsset`。
- MVP 范围：位置、缩放、播放动作选择和背景引用。

## Project 模型

项目不能把一个画布当成整个游戏的唯一容器。项目拥有全局资产库和多个 Board。

```text
Project
-> Asset Library
   -> characters
   -> skeletons
   -> animations
   -> scenes
   -> previews
-> Boards
   -> Character - Archer
   -> Scene - Forest
   -> Animation Test - Archer Walk
   -> Composition - Forest Encounter
```

MVP 可以先只有一个默认 Board，但 schema 从一开始就必须预留 `boards`。

## Board 和 Node 模型

Board 保存画布状态、节点和连线。

Node 是资产的可视化引用：

- `CharacterNode` 引用 `CharacterAsset`。
- `SkeletonNode` 引用 `SkeletonAsset`。
- `AnimationNode` 引用一个或多个 `AnimationAsset`。
- `SceneNode` 引用 `SceneAsset`。
- `PreviewNode` 引用 `PreviewAsset`。
- `CompositionPreviewNode` 引用 `CompositionPreviewAsset`。

大体积资产数据必须存在项目资产库里，不能直接塞进 node 对象。

## 可编辑流水线

工作流的每个阶段都可以编辑。

```text
Character
-> Skeleton
-> Animation
-> Preview
```

修改上游阶段时，下游节点会被标记为过期，除非下游节点被用户锁定。

节点状态：

- `draft`：已创建，但还没生成。
- `running`：正在执行。
- `ready`：已生成，可使用。
- `dirty`：上游输入已变化，本节点可能过期。
- `failed`：执行失败。
- `locked`：用户锁定，不允许自动覆盖。

当用户编辑 `CharacterNode` 时，下游的 `SkeletonNode`、`AnimationNode`、`PreviewNode` 会变成 `dirty`。UI 应提供：

- 重新生成当前节点。
- 从当前节点继续生成下游。
- 重新生成整条链。
- 保留当前下游结果。
- 锁定当前节点。

## 多角色和场景

一个 Board 可以包含多条工作流：

```text
Character A -> Skeleton A -> Animation A -> Preview A
Character B -> Skeleton B -> Animation B -> Preview B
Scene -> Scene Preview
Preview A + Preview B + Scene Preview -> Composition Preview
```

因此可以支持这类 prompt：

```text
Create an archer and a forest scene, then preview the archer walking in the forest.
```

Dify 可以规划多条链，但本地执行器仍然负责创建资产、节点、连线和组合预览。

## 错误处理

执行过程必须分阶段，并且可以恢复。

- Agent 调用失败时，项目保持不变，并显示 Agent 错误。
- AgentPlan 校验失败时，项目保持不变，并显示 schema 错误。
- 工具执行失败时，受影响的节点或任务标记为 `failed`。
- 同一次执行中已经创建的资产，要么回滚，要么记录为状态明确的局部草稿资产。
- 项目状态变更应尽量通过一个 ProjectStore transaction 边界完成。

MVP 可以对单条生成工作流使用 all-or-nothing 事务。

## 与 Model Gateway 的关系

Agent 层和 Model Gateway 是两层不同能力。

- Dify 是第一阶段 workflow / planner 后端。
- Model Gateway 仍然是 CreativeOS 内部直接调用大模型的唯一入口。
- 业务代码不能直接调用具体模型厂商 SDK。
- 如果本地工具后续需要文本或 JSON 生成，必须通过 Model Gateway，并使用 `planner`、`structured_json`、`cheap_text` 等任务类型。

## MVP 验收标准

- 用户可以提交游戏资产 prompt。
- CreativeOS 调用 `AgentProvider` 并获得通过校验的计划。
- 本地执行器创建角色、骨架、动画和预览资产。
- Board 中显示生成链路对应的连接节点。
- Preview 使用 Canvas2D 播放 `idle`、`walk`、`attack`。
- 用户可以编辑某个阶段，并将下游阶段标记为 dirty。
- 项目数据可以保存和重新加载，包含资产库和 boards。
- Dify 相关代码隔离在 `DifyAgentProvider` 后面。

## 实现顺序

1. 定义 AgentPlan、资产、Board、Node、Edge 和工作流状态的核心 schema。
2. 实现本地 `ToolExecutor` 和确定性的 MVP 工具。
3. 添加 `AgentProvider` 抽象和 `DifyAgentProvider` stub / API 边界。
4. 添加项目状态变更流程，把工具输出转换为资产、节点和连线。
5. 在 Board UI 中加入 prompt 入口，并渲染生成出的工作流节点。
6. 将 Preview Node 接入 Canvas2D runtime。
7. 添加 dirty / locked 状态处理。
8. 添加项目资产库和 boards 的保存 / 加载。

