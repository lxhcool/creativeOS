# 07 Model Gateway

## 目标

模型配置必须可在界面中增删改，不允许每新增一个模型就改源码。

## 核心结构

```text
Agent / Tool
   ↓
Model Gateway
   ↓
Model Provider
   ├─ OpenAI
   ├─ Claude
   ├─ Gemini
   ├─ DeepSeek
   ├─ Qwen
   ├─ Kimi
   ├─ OpenRouter
   └─ Custom OpenAI Compatible
```

## 原则

业务代码只调用 Model Gateway。

禁止在业务逻辑中直接调用：

- OpenAI SDK
- Anthropic SDK
- Gemini SDK
- DeepSeek SDK

## AI Provider Center

界面应支持：

- 新增 Provider
- 编辑 Provider
- 删除 Provider
- 启用 / 禁用 Provider
- 测试连接
- 查看连接状态

## 必须支持的 Provider 类型

- OpenAI
- Anthropic
- Google Gemini
- DeepSeek
- OpenRouter
- OpenAI Compatible
- Ollama / Local Model（后续）

## OpenAI Compatible

必须支持。

因为以下服务常走 OpenAI Compatible：

- DeepSeek
- Qwen
- SiliconFlow
- Together
- Fireworks
- Groq
- vLLM
- LM Studio
- Ollama OpenAI Mode

## Model Registry

每个模型需配置：

- modelId
- providerId
- modelName
- displayName
- capabilities
- contextWindow
- supportsJsonMode
- supportsToolCalling
- supportsVision
- enabled
- costLevel

## Routing Center

不同任务可以选择不同模型：

```text
planner → Claude / GPT
character_generation → DeepSeek / GPT
skeleton_generation → GPT / Claude
animation_generation → GPT / Claude
cheap_text → DeepSeek / Qwen
fallback → DeepSeek / OpenAI
```

## Fallback

模型调用失败时：

```text
primary model failed
→ fallback model
→ still failed
→ recoverable error
```

## Cost Tracking

每次调用记录：

- provider
- model
- taskType
- latency
- promptTokens
- completionTokens
- estimatedCost
- success
- errorMessage
