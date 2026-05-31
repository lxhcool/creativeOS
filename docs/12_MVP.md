# 12 MVP

## 用户主流程

```text
用户注册 / 登录
→ 配置 AI Provider
→ 创建项目
→ 输入：生成一个弓箭手
→ Agent 生成执行计划
→ 创建 Character Node
→ 创建 Skeleton Node
→ 创建 Animation Node
→ 创建 Preview Node
→ Canvas2D 播放火柴人动画
→ 保存 project.json
```

## 第一阶段效果

类似火柴人级别骨骼动画预览。

不要求真实图片，不要求 AI 生图。

## 角色动作

必须支持：

- idle
- walk
- attack / shoot

## 成功标准

- 登录注册可用
- 模型配置可用
- 画布可用
- 节点可连线
- 角色生成流程可跑通
- 动画可播放
- 项目可保存加载
