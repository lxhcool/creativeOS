# Agent Guidelines

## UI Theme

- Follow the visual language in `src/app/settings/providers/page.tsx` and the settings components.
- The product UI theme is dark glass, not blue: use `#02070b` / near-black backgrounds, `bg-white/[0.06]` to `bg-white/[0.14]`, `border-white/10`, white text opacity, blur, and black shadows.
- Do not use blue/sky/accent fills for primary canvas controls unless the user explicitly asks for blue. `--color-accent` exists, but it is not the default product-control theme.
- Selected states should usually be white glass, for example `bg-white/[0.12] text-white`.
- Primary action buttons should match `components/ui/Button.tsx` primary styling: white glass, subtle border, hover via higher white opacity.
- Keep canvas node controls compact and internal to the node: top tools, middle input/content area, bottom model selector plus send action.
- Use Radix primitives for reusable interaction foundations such as popovers and scroll areas, then style them with the project's dark glass theme instead of ad hoc native dropdowns or scrollbars.
- Do not use native `alert`, `confirm`, or `prompt` for product interactions. Destructive actions such as deleting a canvas must use a themed confirmation component/modal with explicit cancel and confirm actions.

## Product Copy

- Keep workflow and assistant copy short, direct, and action-oriented.
- Do not write explanatory onboarding paragraphs that describe the system, for example "这是小说创作工作流总控..." or "你不用先建节点...".
- Prefer concise prompts such as "说说你的小说想法", "编剧构思中", "下一步：生成角色与场景".
- Avoid exposing implementation language to users unless it is part of an intentional product concept. Do not casually mention "agent", "strategy", "节点模板", or internal orchestration details in user-facing copy.
- AI assistant messages may be playful, but should still communicate current status or the next available action.
- Do not use hard-coded natural-language trigger phrases such as "开始", "继续", "就这个", or numeric replies to drive workflow state. Workflow progression must come from structured state, selected options, canvas context, or model/strategy decisions.
