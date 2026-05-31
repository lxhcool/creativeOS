# 03 Architecture

## 总体架构

```text
Frontend Layer
  Next.js / React / TypeScript

Canvas Layer
  @xyflow/react

Runtime Layer
  Canvas2D Preview Runtime

State Layer
  Zustand

Auth Layer
  Email Code Auth + Session Cookie

Agent Layer
  AgentProvider abstraction
  Current implementation: Dify

Model Layer
  Model Gateway
  Provider Center
  Model Registry
  Routing Center

Tool Layer
  createCharacter
  createSkeleton
  createAnimation
  createPreview

Asset Layer
  Asset Store

Project Layer
  project.json
  IndexedDB
  optional cloud backup
```

## 核心原则

业务代码不直接依赖具体模型厂商。  
业务代码不直接调用 OpenAI / Claude / Gemini / DeepSeek SDK。  
所有模型调用必须经过 Model Gateway。  
所有 Agent 调用必须经过 AgentProvider。  
所有画布内容必须落到 Project Schema。
