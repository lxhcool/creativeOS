# 08 Node System

## 目标

Creative OS 中所有内容都通过 Node 表达。

第一阶段节点：

- Character Node
- Skeleton Node
- Animation Node
- Preview Node

未来节点：

- Image Node
- Video Node
- Text Node
- PPT Node
- Agent Node

## 节点原则

- Node 是画布上的可视化单元
- Node 只保存自身配置和引用
- 大型资源通过 Asset 引用
- Node 之间通过 Edge 连接
- Node 不直接保存全局状态

## 第一阶段数据流

```text
Character Node
→ Skeleton Node
→ Animation Node
→ Preview Node
```
