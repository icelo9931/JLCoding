// 内置 Agent 注册表：首页展示、项目主导选择、头像注入
export interface AgentDef {
  id: string
  name: string
  tagline: string
  description: string // 悬浮解释（2-3 句）
  color: string // tailwind 文本色
  bg: string // 头像底色
  role?: string // 对应管线角色名
}

export const AGENTS: AgentDef[] = [
  {
    id: 'analyst',
    name: '业务分析师',
    tagline: '把想法变成清晰需求',
    description: '帮你把"想做个东西"梳理成功能清单和用户故事。需求模糊时选它，先对齐再动手。',
    color: 'text-sky-400',
    bg: 'bg-sky-950',
    role: '业务分析师',
  },
  {
    id: 'data-analyst',
    name: '数据分析',
    tagline: '读懂你上传的数据',
    description: '解析你上传的文本/表格/CSV 数据，提炼关键事实供开发引用。上传文件后它会自动参与。',
    color: 'text-amber-400',
    bg: 'bg-amber-950',
  },
  {
    id: 'architect',
    name: '架构设计师',
    tagline: '规划组件与状态',
    description: '设计组件树、状态管理和文件拆分。关心可维护性与结构清晰的项目选它主导。',
    color: 'text-violet-400',
    bg: 'bg-violet-950',
    role: '架构设计师',
  },
  {
    id: 'engineer',
    name: '代码工程师',
    tagline: '写出可运行的应用',
    description: '已注入 GitHub 开源 TDD 编码技能（obra/superpowers），先验证再交付，默认选择。',
    color: 'text-emerald-400',
    bg: 'bg-emerald-950',
    role: '代码工程师',
  },
  {
    id: 'tester',
    name: '测试工程师',
    tagline: '校验构建与查错',
    description: '运行构建校验、定位错误根源。对质量敏感、要求零报错的项目选它主导。',
    color: 'text-orange-400',
    bg: 'bg-orange-950',
    role: '测试工程师',
  },
  {
    id: 'fixer',
    name: '修复工程师',
    tagline: '只修错误不重写',
    description: '构建失败时的外科手术式修复，最小改动让应用跑通。返工与迭代阶段的好手。',
    color: 'text-rose-400',
    bg: 'bg-rose-950',
    role: '修复工程师',
  },
]

export const DEFAULT_AGENT = 'engineer'

export function findAgent(id?: string | null): AgentDef | null {
  return AGENTS.find((a) => a.id === id) ?? null
}

// 主导 agent 的视角提示（注入各阶段 instructions）
export function agentHint(id?: string | null): string {
  const a = findAgent(id)
  if (!a || a.id === DEFAULT_AGENT) return ''
  return `\n\n用户指定「${a.name}」作为本项目的主导视角（${a.tagline}）：${a.description}请在各阶段输出中优先体现该视角的关注点。`
}
