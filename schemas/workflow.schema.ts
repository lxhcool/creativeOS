export interface Workflow {
  id: string
  name: string
  steps: WorkflowStep[]
}

export interface WorkflowStep {
  id: string
  type: 'tool' | 'agent' | 'condition'
  config: Record<string, unknown>
}
