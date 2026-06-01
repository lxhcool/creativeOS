# Game Asset Workflow Design

Date: 2026-06-01

## Goal

CreativeOS first validates Game Asset Studio through an editable game asset workflow, not a one-shot image generator.

The MVP user flow is:

```text
User prompt
-> Dify planner
-> validated AgentPlan
-> local tool execution
-> reusable assets
-> canvas nodes and edges
-> Canvas2D preview
-> project save/load
```

The first production workflow creates a character asset chain with `idle`, `walk`, and `attack` animation previews. The architecture must also support multiple characters, optional scenes, and composition previews without putting an entire game into one canvas.

## Product Boundary

CreativeOS is a personal AI infinite canvas workspace. Game Asset Studio is the first validation module.

MVP includes:

- Multiple asset workflows inside one project.
- Character, skeleton, animation, scene, preview, and composition assets.
- Canvas nodes that reference assets instead of storing large asset data inline.
- Editable workflow stages with downstream invalidation.
- Dify as the first Agent/Workflow backend.
- Local schema validation and local project mutation.

MVP excludes:

- AI image generation.
- Spine export.
- Unity export.
- Full game runtime logic.
- Complex map editing, collision, pathfinding, and battle systems.
- Multi-user collaboration.

## Architecture

The recommended architecture is Dify Planner plus Local Tool Executor.

```text
Frontend
-> Agent API
-> AgentProvider
-> DifyAgentProvider
-> AgentPlan JSON
-> Zod validation
-> ToolExecutor
-> AssetStore
-> ProjectStore
-> Board canvas
-> Preview runtime
```

Dify only plans. It must not directly write project state, mutate a database, or create canvas nodes. CreativeOS owns all deterministic state changes.

## AgentProvider Boundary

Business code calls `AgentProvider`, not Dify directly.

```ts
type AgentProvider = {
  runGameAssetPlan(input: GameAssetPlanInput): Promise<AgentPlan>;
};
```

`DifyAgentProvider` is the first implementation. Future implementations can use LangGraph, a local workflow engine, or direct Model Gateway calls without changing asset and project code.

## AgentPlan Schema

Dify returns an execution plan, not complete project state.

```json
{
  "version": "1",
  "intent": "create_game_asset_workflow",
  "summary": "Create an archer character with idle, walk, and attack animations.",
  "tools": [
    {
      "name": "createCharacter",
      "input": {
        "kind": "archer",
        "style": "stickman",
        "description": "A simple archer game character"
      }
    },
    {
      "name": "createSkeleton",
      "input": {
        "rig": "humanoid_2d",
        "proportion": "chibi"
      }
    },
    {
      "name": "createAnimation",
      "input": {
        "actions": ["idle", "walk", "attack"]
      }
    },
    {
      "name": "createPreview",
      "input": {
        "runtime": "canvas2d"
      }
    }
  ]
}
```

Every plan is validated before execution. Unknown tools, invalid fields, missing required inputs, and unsupported versions fail before project mutation.

## Local Tools

`createCharacter`

- Creates character metadata.
- Output: `CharacterAsset`.
- Example fields: kind, display name, style, description, tags.

`createSkeleton`

- Creates a reusable 2D rig for a character.
- Output: `SkeletonAsset`.
- Depends on a character when part of a character chain.
- Example fields: joints, bones, proportions, attachment points.

`createAnimation`

- Creates keyframe animation assets.
- Output: one or more `AnimationAsset` records.
- Depends on a skeleton.
- MVP actions: `idle`, `walk`, `attack`.

`createScene`

- Creates a simple scene asset.
- Output: `SceneAsset`.
- MVP scope: metadata and simple visual/layout representation, not full map editing.

`createPreview`

- Creates a preview asset for one asset chain.
- Output: `PreviewAsset`.
- MVP runtime: Canvas2D.

`createCompositionPreview`

- Creates a preview that combines multiple characters and/or scenes.
- Output: `CompositionPreviewAsset`.
- MVP scope: placement, scale, playback selection, and background reference.

## Project Model

A project should not use one canvas as the container for the whole game. The project owns global assets and multiple boards.

```text
Project
-> Asset Library
   -> characters
   -> skeletons
   -> animations
   -> scenes
   -> previews
-> Boards
   -> Character - Archer
   -> Scene - Forest
   -> Animation Test - Archer Walk
   -> Composition - Forest Encounter
```

MVP may start with one default board, but the schema must reserve `boards` from the beginning.

## Board And Node Model

Boards contain canvas state, nodes, and edges.

Nodes are visual references:

- `CharacterNode` references `CharacterAsset`.
- `SkeletonNode` references `SkeletonAsset`.
- `AnimationNode` references one or more `AnimationAsset` records.
- `SceneNode` references `SceneAsset`.
- `PreviewNode` references `PreviewAsset`.
- `CompositionPreviewNode` references `CompositionPreviewAsset`.

Large asset data must live in the project asset library, not inside node objects.

## Editable Flow

The workflow is editable at every stage.

```text
Character
-> Skeleton
-> Animation
-> Preview
```

Changing an upstream stage marks downstream nodes as stale unless they are locked.

Node states:

- `draft`: created but not generated.
- `running`: currently executing.
- `ready`: generated and usable.
- `dirty`: upstream input changed.
- `failed`: execution failed.
- `locked`: user locked the node against automatic overwrite.

When a user edits `CharacterNode`, downstream `SkeletonNode`, `AnimationNode`, and `PreviewNode` become `dirty`. The UI should offer:

- Regenerate selected node.
- Regenerate downstream.
- Regenerate whole chain.
- Keep current downstream results.
- Lock selected node.

## Multiple Characters And Scenes

One board can contain multiple workflows:

```text
Character A -> Skeleton A -> Animation A -> Preview A
Character B -> Skeleton B -> Animation B -> Preview B
Scene -> Scene Preview
Preview A + Preview B + Scene Preview -> Composition Preview
```

This enables prompts such as:

```text
Create an archer and a forest scene, then preview the archer walking in the forest.
```

Dify can plan multiple chains, but local execution still creates assets, nodes, edges, and composition previews.

## Error Handling

Execution must be staged and recoverable.

- Agent call failure leaves the project unchanged and shows an agent error.
- AgentPlan validation failure leaves the project unchanged and shows schema errors.
- Tool failure marks the affected node or task as `failed`.
- Previously created assets in the same run should either be rolled back or recorded as partial draft assets with clear status.
- Project mutation must happen through a single ProjectStore transaction boundary where feasible.

MVP can use an all-or-nothing transaction for one generated workflow.

## Model Gateway Relationship

The Agent layer is separate from the Model Gateway.

- Dify is the first workflow/planner backend.
- Model Gateway remains the single entry point for direct LLM calls inside CreativeOS.
- Business code must not call provider SDKs directly.
- If local tools later need LLM text or JSON generation, they call Model Gateway with task types such as `planner`, `structured_json`, or `cheap_text`.

## MVP Acceptance Criteria

- User can submit a game asset prompt.
- CreativeOS calls `AgentProvider` and receives a validated plan.
- Local executor creates character, skeleton, animation, and preview assets.
- A board shows connected nodes for the generated chain.
- Preview plays `idle`, `walk`, and `attack` using Canvas2D.
- User can edit one stage and mark downstream stages dirty.
- Project data saves and reloads with asset library plus boards.
- Dify-specific code is isolated behind `DifyAgentProvider`.

## Implementation Order

1. Define core schemas for AgentPlan, assets, board, nodes, edges, and workflow status.
2. Implement local `ToolExecutor` with deterministic MVP tools.
3. Add `AgentProvider` abstraction and `DifyAgentProvider` stub/API boundary.
4. Add project mutation flow that converts tool outputs into assets, nodes, and edges.
5. Add board UI entry to submit a prompt and render generated workflow nodes.
6. Connect Preview Node to Canvas2D runtime.
7. Add dirty/locked state handling for stage edits.
8. Add save/load support for project assets and boards.
