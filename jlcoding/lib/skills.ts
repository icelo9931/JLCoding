// 技能库：内置（GitHub 注入）+ 自定义（用户本地定义，随请求注入）
export interface SkillDef {
  id: string
  name: string
  source: string
  summary: string
  injection: string // 注入到代码工程师 instructions 的文本
  builtin: boolean
}

export const BUILT_IN_SKILLS: SkillDef[] = [
  {
    id: 'tdd',
    name: '测试驱动开发 (TDD)',
    source: 'github.com/obra/superpowers · skills/test-driven-development',
    summary: '开源知名编码技能：先写测试、看它失败、再写最小实现。已适配 jlCoding 沙箱：先静态自检再交付。',
    injection: `
【已注入技能：测试驱动开发（TDD，来自 GitHub obra/superpowers）】
- 核心纪律：没有失败的验证就没有实现。写每个组件前先想清楚"怎么证明它工作"。
- Red-Green-Refactor：先明确预期行为（Red），写最小实现让它成立（Green），再精简结构（Refactor）。
- 适配本沙箱：没有测试框架，因此每写完一个文件，在脑中过一遍关键路径（渲染→交互→状态更新），
  确认无未定义变量、无遗漏 import、无死代码；交付前保证应用可直接运行且无控制台报错。
- 禁止交付占位代码（TODO / 假实现）；不确定的行为宁可简化也不要含糊。`,
    builtin: true,
  },
]

export interface CustomSkill {
  id: string
  name: string
  content: string
}

export interface CustomAgent {
  id: string
  name: string
  prompt: string
  color: string
}

export interface McpConfig {
  id: string
  name: string
  url: string
  note: string
}

// 自定义技能 → 注入文本
export function customSkillsInjection(skills: CustomSkill[]): string {
  if (!skills.length) return ''
  return (
    '\n【用户自定义技能】\n' +
    skills.map((s) => `- ${s.name}：${s.content}`).join('\n')
  )
}

// MCP 配置 → 以说明形式注入（真实 MCP 协议接入为扩展方向）
export function mcpInjection(mcps: McpConfig[]): string {
  if (!mcps.length) return ''
  return (
    '\n【用户登记的 MCP 服务（以说明形式参考）】\n' +
    mcps.map((m) => `- ${m.name}（${m.url}）：${m.note}`).join('\n') +
    '\n当前版本 MCP 尚未协议级接入，其能力描述作为上下文参考。'
  )
}
