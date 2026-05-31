# 02 PRD

## 第一阶段目标

用户输入一句话，例如：

```text
生成一个弓箭手角色
```

系统自动生成：

```text
Character Node
→ Skeleton Node
→ Animation Node
→ Preview Node
```

最终在网页中看到火柴人级别的角色动画预览。

## 第一阶段包含

- 个人账号系统
- 邮箱验证码登录 / 自动注册
- 个人工作区
- 项目列表
- 无限画布
- 节点与连线
- Character Node
- Skeleton Node
- Animation Node
- Preview Node
- Canvas2D 预览
- project.json 保存 / 加载
- AI Provider Center
- Model Registry
- Model Routing

## 第一阶段不包含

- AI 生图
- 视频生成
- Unity 导出
- Spine 导出
- 团队协作
- 多租户
- RBAC
- 企业审计系统

## MVP 成功标准

- 用户可以注册 / 登录
- 用户可以配置至少一个 AI Provider
- 用户可以创建项目
- 用户可以在画布中生成角色资产工作流
- 用户可以预览 idle / walk / attack 动作
- 用户可以保存并重新加载项目
