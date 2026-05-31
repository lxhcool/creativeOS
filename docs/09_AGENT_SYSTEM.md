# 09 Agent System

## 当前选择

第一阶段使用 Dify 作为 Agent / Workflow 层。

但系统架构中必须保留 AgentProvider 抽象，避免未来被 Dify 锁死。

## Agent 职责

Agent 只负责：

- 理解用户需求
- 生成执行计划
- 调用工具
- 返回结构化结果

Agent 不负责：

- 保存项目状态
- 直接修改数据库
- 直接写入 project.json

项目状态由 Project System 统一管理。

## Agent Flow

```text
Prompt
→ Planner
→ Tool Executor
→ Tool Result
→ Schema Validation
→ Node Creation
```

## 第一阶段工具

- createCharacter
- createSkeleton
- createAnimation
- createPreview

## 输出要求

Agent 输出必须是 JSON。

所有输出必须经过 Schema 校验。

大模型输出不可信，禁止直接写入项目状态。
