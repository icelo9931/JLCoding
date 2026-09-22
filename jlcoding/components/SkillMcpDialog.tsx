'use client'

import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { BUILT_IN_SKILLS } from '@/lib/skills'
import {
  loadCustom, upsertSkill, removeSkill, upsertAgent, removeAgent, upsertMcp, removeMcp,
} from '@/lib/custom-store'
import type { CustomSkill, CustomAgent, McpConfig } from '@/lib/skills'
import { X, Plus, Trash2, Wrench, Bot, Plug, CheckCircle2 } from 'lucide-react'

export function SkillMcpDialog({ open, onOpenChange }: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [skills, setSkills] = useState<CustomSkill[]>([])
  const [agents, setAgents] = useState<CustomAgent[]>([])
  const [mcps, setMcps] = useState<McpConfig[]>([])
  const [tab, setTab] = useState<'skills' | 'agents' | 'mcp'>('skills')

  // 表单
  const [skillForm, setSkillForm] = useState({ name: '', content: '' })
  const [agentForm, setAgentForm] = useState({ name: '', prompt: '' })
  const [mcpForm, setMcpForm] = useState({ name: '', url: '', note: '' })

  useEffect(() => {
    if (open) {
      const s = loadCustom()
      setSkills(s.skills)
      setAgents(s.agents)
      setMcps(s.mcps)
    }
  }, [open])

  const addSkill = () => {
    if (!skillForm.name.trim() || !skillForm.content.trim()) return
    upsertSkill({ id: `skill-${Date.now()}`, name: skillForm.name.trim(), content: skillForm.content.trim() })
    setSkills(loadCustom().skills)
    setSkillForm({ name: '', content: '' })
  }
  const addAgent = () => {
    if (!agentForm.name.trim() || !agentForm.prompt.trim()) return
    upsertAgent({ id: `custom:${Date.now()}`, name: agentForm.name.trim(), prompt: agentForm.prompt.trim(), color: 'text-zinc-300' })
    setAgents(loadCustom().agents)
    setAgentForm({ name: '', prompt: '' })
  }
  const addMcp = () => {
    if (!mcpForm.name.trim()) return
    upsertMcp({ id: `mcp-${Date.now()}`, name: mcpForm.name.trim(), url: mcpForm.url.trim(), note: mcpForm.note.trim() })
    setMcps(loadCustom().mcps)
    setMcpForm({ name: '', url: '', note: '' })
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/70" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[min(640px,92vw)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-950 p-5 shadow-2xl">
          <div className="flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold">技能 · MCP · 自定义 Agent</Dialog.Title>
            <Dialog.Close asChild>
              <button className="rounded-md p-1 text-zinc-500 hover:bg-zinc-800 hover:text-white"><X className="h-4 w-4" /></button>
            </Dialog.Close>
          </div>

          {/* 标签页 */}
          <div className="mt-4 flex gap-1 border-b">
            {([['skills', '技能 Skill', Wrench], ['agents', '自定义 Agent', Bot], ['mcp', 'MCP 服务', Plug]] as const).map(([key, label, Icon]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 text-sm transition-colors',
                  tab === key ? 'border-b-2 border-indigo-500 font-medium text-white' : 'text-zinc-500 hover:text-zinc-300'
                )}
              >
                <Icon className="h-3.5 w-3.5" />{label}
              </button>
            ))}
          </div>

          <div className="mt-4 space-y-4">
            {tab === 'skills' && (
              <>
                {/* 内置技能（GitHub 注入） */}
                {BUILT_IN_SKILLS.map((s) => (
                  <div key={s.id} className="rounded-xl border border-emerald-800/60 bg-emerald-950/20 p-3.5">
                    <div className="flex items-center gap-2 text-sm font-medium text-emerald-300">
                      <CheckCircle2 className="h-4 w-4" />{s.name}
                      <span className="rounded-full border border-emerald-800 bg-emerald-950 px-2 py-0.5 text-[10px] text-emerald-400">已注入</span>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">{s.summary}</p>
                    <p className="mt-1 text-[10px] text-zinc-600">来源：{s.source}</p>
                  </div>
                ))}
                {/* 自定义技能 */}
                {skills.map((s) => (
                  <div key={s.id} className="flex items-start justify-between gap-2 rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-zinc-200">{s.name}</div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">{s.content}</p>
                    </div>
                    <button onClick={() => { removeSkill(s.id); setSkills(loadCustom().skills) }} className="rounded p-1 text-zinc-600 hover:text-red-400">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <div className="rounded-xl border border-dashed border-zinc-700 p-3">
                  <div className="mb-2 flex items-center gap-1.5 text-xs text-zinc-400"><Plus className="h-3.5 w-3.5" />添加自定义技能（生成时注入代码工程师）</div>
                  <input
                    value={skillForm.name}
                    onChange={(e) => setSkillForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="技能名称，如：移动端适配优先"
                    className="mb-2 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs outline-none focus:border-indigo-600"
                  />
                  <textarea
                    value={skillForm.content}
                    onChange={(e) => setSkillForm((f) => ({ ...f, content: e.target.value }))}
                    rows={3}
                    placeholder="技能内容（对生成代码的要求与纪律），如：所有组件默认响应式，移动端优先…"
                    className="w-full resize-none rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs outline-none focus:border-indigo-600"
                  />
                  <Button size="sm" className="mt-2" onClick={addSkill} disabled={!skillForm.name.trim() || !skillForm.content.trim()}>添加技能</Button>
                </div>
              </>
            )}

            {tab === 'agents' && (
              <>
                <p className="text-xs text-zinc-500">自定义 agent 会出现在首页头像栏，可指定其主导项目视角。</p>
                {agents.map((a) => (
                  <div key={a.id} className="flex items-start justify-between gap-2 rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-zinc-200">{a.name}</div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">{a.prompt}</p>
                    </div>
                    <button onClick={() => { removeAgent(a.id); setAgents(loadCustom().agents) }} className="rounded p-1 text-zinc-600 hover:text-red-400">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <div className="rounded-xl border border-dashed border-zinc-700 p-3">
                  <div className="mb-2 flex items-center gap-1.5 text-xs text-zinc-400"><Plus className="h-3.5 w-3.5" />创建自定义 Agent</div>
                  <input
                    value={agentForm.name}
                    onChange={(e) => setAgentForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Agent 名称，如：极简主义设计师"
                    className="mb-2 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs outline-none focus:border-indigo-600"
                  />
                  <textarea
                    value={agentForm.prompt}
                    onChange={(e) => setAgentForm((f) => ({ ...f, prompt: e.target.value }))}
                    rows={3}
                    placeholder="主导视角描述（注入各阶段），如：追求极简 UI，能用原生元素就不加样式，文案精炼…"
                    className="w-full resize-none rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs outline-none focus:border-indigo-600"
                  />
                  <Button size="sm" className="mt-2" onClick={addAgent} disabled={!agentForm.name.trim() || !agentForm.prompt.trim()}>创建 Agent</Button>
                </div>
              </>
            )}

            {tab === 'mcp' && (
              <>
                <p className="text-xs leading-relaxed text-amber-400/80">
                  实验性：当前版本 MCP 以「能力说明」形式注入生成上下文（协议级工具调用为扩展方向）。
                </p>
                {mcps.map((m) => (
                  <div key={m.id} className="flex items-start justify-between gap-2 rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-zinc-200">{m.name} <span className="ml-1 text-[10px] text-zinc-600">{m.url}</span></div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">{m.note}</p>
                    </div>
                    <button onClick={() => { removeMcp(m.id); setMcps(loadCustom().mcps) }} className="rounded p-1 text-zinc-600 hover:text-red-400">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <div className="rounded-xl border border-dashed border-zinc-700 p-3">
                  <div className="mb-2 flex items-center gap-1.5 text-xs text-zinc-400"><Plus className="h-3.5 w-3.5" />登记 MCP 服务</div>
                  <input
                    value={mcpForm.name}
                    onChange={(e) => setMcpForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="服务名称，如：天气数据服务"
                    className="mb-2 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs outline-none focus:border-indigo-600"
                  />
                  <input
                    value={mcpForm.url}
                    onChange={(e) => setMcpForm((f) => ({ ...f, url: e.target.value }))}
                    placeholder="服务地址（可选），如 https://api.example.com/mcp"
                    className="mb-2 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs outline-none focus:border-indigo-600"
                  />
                  <input
                    value={mcpForm.note}
                    onChange={(e) => setMcpForm((f) => ({ ...f, note: e.target.value }))}
                    placeholder="能力说明：它能提供什么数据/工具，生成时如何参考"
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs outline-none focus:border-indigo-600"
                  />
                  <Button size="sm" className="mt-2" onClick={addMcp} disabled={!mcpForm.name.trim()}>登记</Button>
                </div>
              </>
            )}
          </div>

          <Dialog.Description className="mt-4 text-center text-[11px] text-zinc-600">
            自定义内容保存在浏览器本地，生成请求时自动注入 · 刷新页面后首页头像栏可见新 Agent
          </Dialog.Description>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
