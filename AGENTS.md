# Agent Guidelines

## UI Theme

- Follow the visual language in `src/app/settings/providers/page.tsx` and the settings components.
- The product UI theme is dark glass, not blue: use `#02070b` / near-black backgrounds, `bg-white/[0.06]` to `bg-white/[0.14]`, `border-white/10`, white text opacity, blur, and black shadows.
- Do not use blue/sky/accent fills for primary canvas controls unless the user explicitly asks for blue. `--color-accent` exists, but it is not the default product-control theme.
- Selected states should usually be white glass, for example `bg-white/[0.12] text-white`.
- Primary action buttons should match `components/ui/Button.tsx` primary styling: white glass, subtle border, hover via higher white opacity.
- Keep canvas node controls compact and internal to the node: top tools, middle input/content area, bottom model selector plus send action.
- Use Radix primitives for reusable interaction foundations such as popovers and scroll areas, then style them with the project's dark glass theme instead of ad hoc native dropdowns or scrollbars.
