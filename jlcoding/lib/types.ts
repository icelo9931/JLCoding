export type ServerEvent =
  | { type: 'agent_start'; agent: string; message: string }
  | { type: 'agent_complete'; agent: string; result: string }
  | { type: 'file_created'; path: string; content: string }
  | { type: 'file_updated'; path: string; content: string }
  | { type: 'command_run'; command: string; stdout: string; stderr: string; exitCode: number }
  | { type: 'preview_ready' }
  | { type: 'task_progress'; step: number; total: number; label: string }
  | { type: 'awaiting_confirmation'; analysis: string }
  | { type: 'paused' }
  | { type: 'error'; message: string }
  | { type: 'complete'; projectId: string }

export type AgentRole = '业务分析师' | '架构设计师' | '代码工程师' | '测试工程师' | '修复工程师'

// 管线阶段标识（Message.step），用于断点恢复
export type PipelineStage = 'analysis' | 'design' | 'engineering' | 'validation' | 'fix'

export const ROLE_STEPS: { role: AgentRole; label: string }[] = [
  { role: '业务分析师', label: '分析需求' },
  { role: '架构设计师', label: '设计架构' },
  { role: '代码工程师', label: '生成代码' },
  { role: '测试工程师', label: '沙箱测试' },
  { role: '修复工程师', label: '自动修复' },
]

export type LogEntry = {
  id: string
  agent: string
  kind: 'text' | 'file' | 'command' | 'build'
  title: string
  detail?: string
  path?: string
  content?: string
  status?: 'running' | 'done' | 'error'
  createdAt: number
}
