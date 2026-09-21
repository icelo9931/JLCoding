# jlCoding

> 输入自然语言需求，AI 智能体把它变成可运行的代码 —— 业务分析 → 架构设计 → 代码生成 → 沙箱校验 → 实时预览，全流程可视化。

在线演示：https://jlcoding.vercel.app （国内推荐用 Render 链接）· Render（国内可达）：`（部署后填写）` · GitHub 仓库：https://github.com/icelo9931/JLCoding

## 本地开发

```bash
cd jlcoding
npm install
cp .env.example .env        # 填入 OPENCODE_API_KEY（不填则 mock 模式）；DATABASE_URL 默认 SQLite
npm run dev                 # scripts/dev.mjs：自动按 DATABASE_URL 选择 schema，SQLite 零外部依赖
```

- 本地默认 **SQLite**（`prisma/schema.dev.prisma`，`file:./dev.db`）；线上（Vercel/Render）用 **Neon Postgres**（`prisma/schema.prisma`）
- 从 Neon 迁移历史项目到本地：`node scripts/migrate-neon.cjs`（需 `.env.neon` 保留 Neon 连接串）
- 冒烟测试：`node scripts/smoke2.cjs`（三场景：确认/追加/暂停续跑）；`node scripts/watch-stream.cjs`（流式观察）

## 实现思路与关键取舍

### 为什么选择单 Agent + prepareStep 而非多智能体框架

8 小时的目标是一个**真正跑得通的闭环**，而不是架构展示。多智能体编排（消息路由、状态同步、失败恢复）在时间约束下只会带来调试噩梦。我使用 Vercel AI SDK 的 `ToolLoopAgent` + `prepareStep`：一个 Agent 实例，在循环的不同步骤动态切换 system prompt 与可用工具，扮演业务分析师 → 架构设计师 → 代码工程师 → 测试工程师 → 修复工程师五个角色。角色推进由 `onStepFinish` 中的状态机控制（无工具调用的纯文本输出视为该阶段完成），`stopWhen` 同时挂状态机条件与步数上限兜底。用户只看到进度条和结果，"多智能体"的体验感知通过右侧工作日志的步骤折叠实现——这是"进阶感"的低成本实现。

### 为什么选择 Sandpack 而非 E2B

我选择 Sandpack 而非 E2B，是因为在 8 小时的时间约束下，保证预览环节 100% 可靠比支持全栈应用更重要。Sandpack 在浏览器内完成打包和渲染，没有服务器沙箱的启动延迟和超时风险，用户从输入需求到看到结果的时间可以控制在 30 秒以内。代价是只支持 React 纯前端应用，不支持需要后端数据库或 API 的应用。如果继续投入时间，接入 E2B 支持全栈是优先级最高的扩展方向。

预览工具栏中的"构建校验：通过（Sandpack 编译耗时 X.Xs）"来自 Sandpack 真实的 start/done 编译事件（`useSandpackClient().listen` 实测），不是编造的数字——用户能感知到"系统确实在验证代码"，而不是直接把代码扔进 iframe。

### 为什么优先做小白闭环而非两个模式

笔试的评判标准是"用户是否真的能用"。一个从输入到预览到下载的完整闭环，比"简单模式 + 高级模式"各做一半更有说服力。所有不在闭环上的需求（用户认证、支付、跨会话记忆、多模型切换）全部砍掉。

### 其他关键取舍

- **SSE 而非 WebSocket**：单向事件流足够，复杂度低一个量级，且 Next.js Route Handler 原生支持；服务端每 15 秒发送 `: ping` 心跳，防止长生成（2-3 分钟）被代理超时掐断。
- **模型层接入 OpenCode Go 套餐**：走 OpenAI 兼容网关（`https://opencode.ai/zen/go/v1`），按官方要求携带 `x-opencode-session` 会话头与 `jlcoding/1.0` User-Agent；顶栏可切换 Go 套餐全部 `/chat/completions` 模型（DeepSeek V4 Flash/Pro、GLM-5.3、Kimi K3 等），选择随项目持久化。无 Key 时自动降级 mock 演示模式。
- **Agent 管线采用顺序角色制**：实测发现 AI SDK v7 的工具循环在"无工具调用的步骤"后必然终止，因此业务分析师/架构设计师独立单轮生成，代码工程师/测试工程师/修复工程师内部保持 ToolLoopAgent 工具循环（`prepareStep` 注入角色指令与工具白名单）——比单一长循环更确定、更易调试。
- **mock 模式兜底**：未配置 API Key 时用预置待办应用走完整事件流，演示永远可用。
- **数据库开发与部署统一用 Vercel Postgres（Neon）**：本地 `.env` 与线上指向同一 Neon 实例，免去本地装 Postgres，且刷新恢复行为与线上一致；`prisma db push` 建表在本地执行，Vercel 构建只做 `prisma generate`（构建环境不做 DDL，更快更稳）。

## 当前完成程度

- ✅ **已完成**：三栏布局（对话 / 实时预览 / Agent 工作日志）+ 顶部通栏进度条；**小白/专家双模式**（首页卡通形象卡片选择，小白模式日志精简为友好阶段摘要，专家模式完整文件树/代码/终端三视图）；**需求确认环节**（分析师产出理解卡片 → 可追加补充并重新分析 → 确认后才继续生成）；**暂停/断点续跑**（顶栏暂停按钮 AbortController 中止，已完成阶段落库，续跑自动跳过不重跑）；模型切换 pill（输入框上方，OpenCode Go 全部 chat/completions 模型，按项目持久化）；Agent 顺序角色管线（分析→设计→编码→校验→修复）；SSE 全事件协议 + 15s 心跳；Sandpack 实时预览（desktop/tablet/mobile、新窗口独立页、真实编译耗时展示）；数据持久化与刷新恢复（对话、日志、文件、待确认状态、暂停状态）；ZIP 下载；Geist 字体 atoms 风格视觉。
- ⚠️ **部分完成**：自动修复循环只做了一轮（校验失败 → 修复角色 → 结束），未做多轮迭代直到通过；"部署"按钮为占位（见未完成）；真实模式依赖 DeepSeek Key（框架已就绪，填 Key 即生效，未在无 Key 环境下实测真实生成质量）。
- ❌ **未完成**：Vercel 在线部署与在线链接（SQLite 与 Serverless 不兼容，需按下方步骤切 Postgres，约 5 分钟，未执行是因为需要 Vercel 账号授权）；GitHub 仓库推送（本地 git 已初始化并提交，推送需账号）；用户认证、支付、多模式切换（按指令明确不做）。

## 如果继续投入时间，我会如何扩展

1. **优先级最高**：接入 E2B 真实沙箱，支持全栈应用（后端 API、数据库），并用真实 `npm run build` 替代模拟校验；自动修复改为多轮循环直到构建通过。
2. **优先级中**：完成 Vercel 部署（provider 切 postgresql + `DATABASE_URL` + `prisma migrate deploy`）；对话内代码 diff 视图（修改需求时只高亮变更文件）；生成过程逐 token 流式展示（目前按步骤粒度展示）。
3. **优先级低**：用户认证与项目归属；多模型切换（GPT-4o / Claude / DeepSeek）；"部署"按钮接 Vercel API 一键部署生成应用；项目模板市场。

## 部署到 Render（国内可达入口，已完成配置）

Render 免费 Web Service（新加坡区域，`*.onrender.com` 国内大多可直连）。仓库根目录的 `render.yaml` 已定义 Blueprint：

1. Render 控制台 → **New → Blueprint** → 选择 `icelo9931/JLCoding` 仓库
2. 按提示填入 3 个 Secret 环境变量（`DATABASE_URL` / `DIRECT_DATABASE_URL` 填 Neon 连接串，`OPENCODE_API_KEY` 填 Go Key），`OPENCODE_BASE_URL` 已内置
3. Deploy；之后每次 `git push` 自动部署

**免费层注意**：15 分钟无流量会休眠（首开约 50 秒）。保活方案：注册 [cron-job.org](https://cron-job.org)（免费）→ Create Job → URL 填 `https://<你的应用>.onrender.app/` → 每 10 分钟执行一次 → 即可常驻。

## 部署到 Vercel（已完成）

实际执行流程（供复现）：

```bash
npm i -g vercel && vercel login
vercel link --yes --project jlcoding
vercel integration add neon            # Marketplace 创建 Vercel Postgres，自动注入 DATABASE_URL 等变量
vercel env add DIRECT_DATABASE_URL <DATABASE_URL_UNPOOLED 的值>   # Prisma 迁移直连
vercel env add OPENCODE_API_KEY / OPENCODE_BASE_URL               # 模型网关凭据
node scripts/sync-env.cjs              # 本地 .env 同步为 Neon 连接串（保留 OpenCode Key）
npm run db:push                        # 本地建表（Vercel 构建不做 DDL）
vercel deploy --prod                   # → https://jlcoding.vercel.app
```

- schema `provider = "postgresql"`，`url`（池化）跑运行时，`directUrl`（非池化）跑建表。
- 构建命令为 `prisma generate && next build`（见 package.json）。
- 线上验证：海外节点 GET `/` 与 `/api/projects` 均 200 OK；SSE 生成接口与本地代码路径一致（本地实测 DeepSeek V4 Flash 全流程 168s，16 个文件，校验通过）。
- 注意：国内网络直连 `*.vercel.app` 常被 SNI 阻断，正式分享建议绑定自定义域名。

## 技术栈

Next.js 14 (App Router) · Tailwind CSS + shadcn/ui 风格组件 · Vercel AI SDK v7（ToolLoopAgent）· OpenCode Go 网关（DeepSeek V4 / GLM / Kimi 等）· Sandpack · Prisma + Vercel Postgres (Neon) · SSE · jszip
