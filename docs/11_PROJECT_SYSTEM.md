# 11 Project System

## project.json

project.json 是 Creative OS 的核心工程格式。

它类似：

- Figma 的 .fig
- Blender 的 .blend
- Unity 的 Scene
- Photoshop 的 PSD

## 保存内容

- project metadata
- canvas state
- nodes
- edges
- assets
- workflows
- agent tasks
- model call logs

## 第一阶段必须支持

- 创建项目
- 保存项目
- 自动保存
- 加载项目
- 导出 project.json
- 导入 project.json

## Project Safety

必须考虑：

- 自动保存
- 崩溃恢复
- Undo / Redo
- Schema migration
- project.json 版本号
