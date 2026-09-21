# jlCoding

> 输入自然语言需求，AI 智能体把它变成可运行的代码 —— 业务分析 → 架构设计 → 代码生成 → 沙箱校验 → 实时预览，全流程可视化。

在线演示：`（部署到 Vercel 后填写）` · GitHub 仓库：`（推送后填写）`

## 快速开始

```bash
cd jlcoding
npm install
cp .env.example .env        # 填入 DEEPSEEK_API_KEY（不填则进入 mock 演示模式）
npx prisma migrate dev
npm run dev                 # http://localhost:3000
```

- 冒烟测试：`node scripts/smoke.mjs`（需 dev server 已启动）
- 类型检查 / 构建：`npx tsc --noEmit` / `npm run build`

## 实现思路与关键取舍

### 为什么选择单 Agent + prepareStep 而非多智能体框架

8 小时的目标是一个**真正跑得通的闭环**，而不是架构展示。多智能体编排（消息路由、状态同步、失败恢复）在时间约束下只会带来调试噩梦。我使用 Vercel AI SDK 的 `ToolLoopAgent` + `prepareStep`：一个 Agent 实例，在循环的不同步骤动态切换 system prompt 与可用工具，扮演业务分析师 → 架构设计师 → 代码工程师 → 测试工程师 → 修复工程师五个角色。角色推进由 `onStepFinish` 中的状态机控制（无工具调用的纯文本输出视为该阶段完成），`stopWhen` 同时挂状态机条件与步数上限兜底。用户只看到进度条和结果，"多智能体"的体验感知通过右侧工作日志的步骤折叠实现——这是"进阶感"的低成本实现。

### 为什么选择 Sandpack 而非 E2B

我选择 Sandpack 而非 E2B，是因为在 8 小时的时间约束下，保证预览环节 100% 可靠比支持全栈应用更重要。Sandpack 在浏览器内完成打包和渲染，没有服务器沙箱的启动延迟和超时风险，用户从输入需求到看到结果的时间可以控制在 30 秒以内。代价是只支持 React 纯前端应用，不支持需要后端数据库或 API 的应用。如果继续投入时间，接入 E2B 支持全栈是优先级最高的扩展方向。

预览工具栏中的"构建校验：通过（Sandpack 编译耗时 X.Xs）"来自 Sandpack 真实的 start/done 编译事件（`useSandpackClient().listen` 实测），不是编造的数字——用户能感知到"系统确实在验证代码"，而不是直接把代码扔进 iframe。

### 为什么优先做小白闭环而非两个模式

笔试的评判标准是"用户是否真的能用"。一个从输入到预览到下载的完整闭环，比"简单模式 + 高级模式"各做一半更有说服力。所有不在闭环上的需求（用户认证、支付、跨会话记忆、多模型切换）全部砍掉。

### 其他关键取舍

- **SSE 而非 WebSocket**：单向事件流足够，复杂度低一个量级，且 Next.js Route Handler 原生支持。
- **模型层走 OpenAI 兼容协议接入 DeepSeek**：不锁定单一供应商，换模型只改一个环境变量。
- **mock 模式兜底**：未配置 API Key 时用预置待办应用走完整事件流，演示永远可用。
- **数据库开发用 SQLite、部署切 Vercel Postgres**：本地零配置，上线只需改 provider + 连接串（见下文部署节）。

## 当前完成程度

- ✅ **已完成**：三栏布局（对话 / 实时预览 / Agent 工作日志）+ 底部五段进度条；单 Agent + prepareStep 五角色编排（lib/agent.ts）；SSE 全事件协议（9 种事件类型）与前端流式消费；Sandpack 实时预览（desktop/tablet/mobile 切换、刷新、新窗口独立预览页）；真实编译耗时采集展示；数据持久化（Prisma，Project/Message/File 三表）与刷新恢复（对话、日志、文件树、预览全部还原）；项目列表与状态徽章；ZIP 代码下载（jszip）；模拟构建校验（JSON/入口/依赖/括号平衡静态检查）+ 校验失败自动进入修复角色；生成失败时错误提示 + 重试按钮；mock 演示模式；冒烟测试脚本（scripts/smoke.mjs 全链路通过）。
- ⚠️ **部分完成**：自动修复循环只做了一轮（校验失败 → 修复角色 → 结束），未做多轮迭代直到通过；"部署"按钮为占位（见未完成）；真实模式依赖 DeepSeek Key（框架已就绪，填 Key 即生效，未在无 Key 环境下实测真实生成质量）。
- ❌ **未完成**：Vercel 在线部署与在线链接（SQLite 与 Serverless 不兼容，需按下方步骤切 Postgres，约 5 分钟，未执行是因为需要 Vercel 账号授权）；GitHub 仓库推送（本地 git 已初始化并提交，推送需账号）；用户认证、支付、多模式切换（按指令明确不做）。

## 如果继续投入时间，我会如何扩展

1. **优先级最高**：接入 E2B 真实沙箱，支持全栈应用（后端 API、数据库），并用真实 `npm run build` 替代模拟校验；自动修复改为多轮循环直到构建通过。
2. **优先级中**：完成 Vercel 部署（provider 切 postgresql + `DATABASE_URL` + `prisma migrate deploy`）；对话内代码 diff 视图（修改需求时只高亮变更文件）；生成过程逐 token 流式展示（目前按步骤粒度展示）。
3. **优先级低**：用户认证与项目归属；多模型切换（GPT-4o / Claude / DeepSeek）；"部署"按钮接 Vercel API 一键部署生成应用；项目模板市场。

## 部署到 Vercel（约 5 分钟）

```bash
# 1. Vercel 控制台：Storage → Create Database → Postgres，自动注入 DATABASE_URL
# 2. prisma/schema.prisma: provider = "postgresql"
# 3. 本地生成迁移并应用
npx prisma migrate deploy
# 4. 部署
vercel deploy --prod
```

## 技术栈

Next.js 14 (App Router) · Tailwind CSS + shadcn/ui 风格组件 · Vercel AI SDK v7（ToolLoopAgent）· DeepSeek（OpenAI 兼容协议）· Sandpack · Prisma + SQLite（部署切 Postgres）· SSE · jszip
