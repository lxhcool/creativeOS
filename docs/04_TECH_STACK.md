# 04 Tech Stack

## Frontend

- Next.js
- React
- TypeScript
- @xyflow/react
- Zustand

## Runtime

- 第一阶段：Canvas2D
- 后续阶段：按需升级 PixiJS / WebGL

## Auth

- Email verification code
- Resend
- HttpOnly Session Cookie

## Agent

- 第一阶段：Dify
- 架构层保留 AgentProvider 抽象

## Model

- Model Gateway
- Provider Center
- Model Registry
- Model Routing

## Storage

- IndexedDB
- project.json
- 后续可增加云端项目备份

## Database

推荐：

- PostgreSQL + Prisma

MVP 也可：

- SQLite + Prisma
