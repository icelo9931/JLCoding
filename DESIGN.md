# jlCoding 设计方案（架构）

> 面向开发的架构说明。功能清单、实现取舍与实测数据见 `README.md`。
> 参照 atoms.dev 的深色三栏工作台：左侧对话、中间实时预览、右侧 Agent 工作日志，底部全流程进度条。

## 1. 界面结构

```
┌──────────────────────────────────────────────────────────────────────────┐
│ jlCoding │ 项目名/状态 │ 版本徽章 │ 发布到发现 │ 部署 │ 下载 │ 暂停 │ 用户 │
├──────────────┬──────────────────────────────┬────────────────────────────┤
│ 对话面板      │   实时预览                     │ Agent 工作日志             │
│ 多轮对话      │   部署页 iframe（零 CDN，默认） │ 日志 │ 文件 │ 终端         │
│ 输入 / 提问   │   或 Sandpack（可切换）        │ 模型调用卡片               │
├──────────────┴──────────────────────────────┴────────────────────────────┤
│ 进度条：分析需求 → 设计架构 → 生成代码 → 沙箱测试 → 预览就绪               │
└──────────────────────────────────────────────────────────────────────────┘
```

路由：

| 路由 | 说明 |
|---|---|
| `/` | 首页：大输入框 + 示例 + 侧栏（我的项目 / 发现入口 / 能力 / 连接） |
| `/project/[id]` | 工作台（三栏）；`?preview=1` 全屏预览；非 owner 查看已发布项目 = **只读模式** |
| `/discover` | 公开社区列表（无需登录），点卡片进入只读工作台 |
| `/app/[id]` | 已部署应用的公开链接（esbuild 自包含 HTML，无鉴权） |

布局随状态切换：生成中/待确认（尚无产出）为**两栏**（对话 2/3 + 进度 1/3），出现生成文件后为**三栏**（宽度可拖拽并记忆）。

## 2. 意图路由（CODE / QA / VERSION）

用户输入先经 `lib/intent-rules.ts`（纯函数、零依赖、可单测）规则层四路分类，未命中的模糊输入由轻量模型（`CLASSIFY_MODEL`）单词分类兜底。

| 意图 | 路由 | 执行 |
|---|---|---|
| CODE | 生成/修改应用 | 五角色构建管线（§3） |
| QA | 提问/解释/评估 | 智能助手单轮工具循环（`web_search` / `read_url` / `read_file`），流式直答，**不进构建状态机** |
| VERSION | 对比 / 回滚 / 列表 | 版本模块**确定性处理**（直接读 `ProjectVersion` 快照，零 LLM）：结构化 diff / `$transaction` 回滚 / 列表 |
| 未命中 | — | 规则未命中 → 轻量模型分类；无 Key 时纯规则 + mock 直答 |

铁律：VERSION 必须先于 CODE 判定（「回滚到 v1 / 对比两轮」绝不触发重新生成）；规则词用负向环视排除名词性引用（「我生成的**应用**…」不触发 CODE）。

## 3. Agent 编排（顺序角色管线）

`lib/agent.ts`：业务分析师、架构设计师为独立单轮生成（`askSingle`，`stopWhen: isStepCount(1)`）；代码工程师/测试工程师/修复工程师使用工具循环（`ToolLoopAgent` + `prepareStep` 注入角色指令与工具白名单）。

| 阶段 | 角色 | 工具 | 推进条件 |
|---|---|---|---|
| 0 | 业务分析师 | 无 | 输出分析文本即进入「待确认」（awaiting_confirmation） |
| 1 | 架构设计师 | 无 | 输出设计文本即完成 |
| 2 | 代码工程师 | writeFile / readFile | 产出完成总结；增量修改轮进入 diff 式只改相关文件 |
| 3 | 测试工程师 | runCommand | 校验通过→完成；失败→修复循环 |
| 4 | 修复工程师 | writeFile / runCommand | 最多 3 轮直至校验通过 |

约束与保护：
- 代码工程师约束为纯 React + JSX、根目录文件、仅 react/react-dom 依赖（Sandpack 可直接编译）；默认语言 React，明确说「用 Python」才生成 tkinter 单文件。
- **空闲看门狗**：单步 120s 无任何流式分片即判死连接（每分片重置计时）；**管线总闸** 900s；超时 → error 事件 + 落库，已完成阶段保留可断点续跑。
- **断点续跑**：已完成阶段（design/engineering）由 `Message.step` 判定并跳过。
- **mock 兜底**：无 Key 且无 BYOK 时预置待办应用走完整事件流（`JLCODING_MOCK=1` 可显式开启）。

## 4. 沙箱与校验

`lib/sandbox.ts`：内存文件映射沙箱；`writeFile/readFile` 操作内存 Map，事件同步落库（Prisma `File` 表 upsert）。

`runCommand("npm run build")` 为**静态校验**（非真实编译）：
- JSON 合法性 / 必需入口与根组件 / 依赖声明（react、react-dom）
- 括号平衡（字符串与注释状态机）
- **const 重赋值检测**（启发式正则，拦截过真实线上 bug）
- **相对 import 解析检查**（`./x` 必须解析到文件集内实际文件，含 .js/.jsx/.ts/.tsx 与目录式；拦截过「校验通过但部署打包失败」的案例）

生成语言与入口判定统一在 `lib/app-meta.ts`（sandbox 校验与前端预览同源，避免「校验通过但预览白屏」）。

真实编译两条通道：
- **浏览器内**：前端 Sandpack 编译（`useSandpackClient().listen` 的 start/done 实测耗时回传），依赖国际 CDN（codesandbox/unpkg），网络波动时不可靠；
- **服务端**：`lib/bundler.ts` 用 esbuild 打包为自包含单文件 HTML（§6），**零 CDN 依赖**，作为预览画布默认通道与部署产物。

## 5. SSE 事件协议

`POST /api/projects/:id/chat` 返回 `text/event-stream`（15s `: ping` 心跳防代理掐断）。

```
run_started(provider, model, runId, intent?) | agent_start | agent_delta | agent_complete
| file_created | file_updated | command_run | task_progress | usage
| awaiting_confirmation | preview_ready | version_created(version, sha, summary)
| paused | error | complete(intent?)
```

前端 `hooks/useAgentStream.ts` 流式解析（跨 chunk 缓冲），驱动进度条、工作日志、对话、文件与版本徽章；流结束统一从 DB 收敛（`syncFromDb`），保证前后端最终一致。

## 6. 版本系统与部署

**版本快照**（`lib/versions.ts`）：每轮生成完成写入 `ProjectVersion`（`version` 递增 / `sha` = 排序后 `path\ncontent` 拼接的 SHA-256 / `filesJson` 全量快照 / `provider`）。append-only，历史不丢。回滚为 `$transaction` 四操作（删旧文件 → 写快照文件 → 建「回滚自 vN」新条目 → 状态置 ready），返回文件集哈希精确等于目标版本。

**部署**（`lib/bundler.ts` + `app/api/projects/[id]/deploy`）：把项目文件写入临时目录 → esbuild 打包（`format: iife`、`jsx: automatic`、react/react-dom 从平台 node_modules 解析、CSS 收集内联、支持 JS/JSX/TS/TSX）→ 单文件自包含 HTML 存 `Deploy` 表 → 公开 `GET /app/:id`（`no-store`）。预览画布默认内嵌该页（`?v=<sha>` 强制刷新），Sandpack 作为可切换项。

## 7. 访问控制与「发现」

`lib/access.ts`：`requireProjectAccess(req, id, { allowPublishedRead })` 统一鉴权。
- 未登录 401 / 非归属 403 / 生成中 409 / DB 不可达 503
- `allowPublishedRead` 时，已发布项目对所有人**只读**放行，并返回 `viewerIsOwner`
- `maskEmail()`：发布者邮箱脱敏（前缀前 3 位 + `***`）

写操作（`chat` / `rollback` / `deploy` / `delete` / `publish`）**永远 owner-only**。前端据 `viewerIsOwner` 进入只读模式（隐藏输入区与写操作、版本下拉只读、预览不触发部署）。

## 8. 数据模型（Prisma）

```
User      (email, passwordHash, name)
Project   (status: draft|building|awaiting|paused|ready|error, mode, agent, model,
           provider, runStartedAt, published, publishedAt, userId)
Message   (role: user|assistant|system, content, step, agent)   // step 驱动断点恢复与日志重建
File      (path, content, language)                              // @@unique(projectId, path)
ProjectVersion (version, sha, provider, summary, filesJson)      // append-only 快照
Deploy    (html, sha)                                            // 部署产物
```

级联：`Message` / `File` / `ProjectVersion` / `Deploy` 均 `onDelete: Cascade`。

双数据库：本地 `schema.dev.prisma`（SQLite，零外部依赖）/ 线上 `schema.prisma`（Postgres + Neon）；`scripts/dev.mjs` 按 `DATABASE_URL` 前缀自动选 schema（并去 BOM）。Schema 变更经 Render Pre-Deploy `prisma db push` 同步。

## 9. API

| 方法 | 路径 | 说明 | 权限 |
|---|---|---|---|
| POST/GET | `/api/projects` | 创建 / 列表 | 登录（GET 未登录返回空） |
| GET | `/api/projects/:id` | 详情（消息/文件/最新部署/`viewerIsOwner`/作者） | owner，或已发布只读 |
| DELETE | `/api/projects/:id` | 删除（级联） | owner |
| POST | `/api/projects/:id/chat` | SSE 生成 / 问答 / 版本操作 | owner |
| POST | `/api/projects/:id/publish` | 发布 / 取消发布（仅 ready） | owner |
| GET | `/api/projects/:id/files` | 文件列表 | owner，或已发布只读 |
| GET | `/api/projects/:id/download` | ZIP 下载（jszip） | owner，或已发布只读 |
| GET | `/api/projects/:id/versions` | 版本列表 | owner，或已发布只读 |
| POST | `/api/projects/:id/versions/:v/rollback` | 回滚到 :v（`$transaction`） | owner |
| POST | `/api/projects/:id/deploy` | esbuild 打包 → 存 Deploy | owner |
| GET | `/app/:id` | 已部署应用公开页（自包含 HTML） | 公开 |
| GET | `/api/discover` | 「发现」公开列表（作者/统计） | 公开 |
| GET | `/api/status` | 平台状态（hasModel / 网关可达 / 默认模型） | 公开 |
| POST | `/api/auth/register\|login\|logout`、GET `/api/auth/me` | 认证（JWT httpOnly Cookie） | — |

## 10. 模型与 BYOK

`lib/models.ts`：OpenCode Zen 精选模型（`deepseek-v4.1-flash` 默认 / `glm-5.3` 走 `/zen/v1`；`deepseek-v4-pro` 走 Go 池 `/zen/go/v1`）。`getModel()` 按模型所属池选端点（同一把 key），并在请求头带 `x-opencode-session` 与 `User-Agent`。

**BYOK**（`lib/byok.ts`）：用户自有 OpenAI 兼容 Key（Base URL / Key / 模型 ID），仅存浏览器 localStorage，随请求传入，服务端仅当次内存使用（不落库、不打日志）。

**可观测**：`Project.provider` 记录每次生成路径（`opencode:<id>` | `byok:<id>` | `mock`）；`run_started` 事件 + 工作日志「模型调用」卡片（Provider / Model / Request ID / 首 Token 延迟）；流内错误（404/429/403）还原为可操作提示，不显示模糊的「No output generated」。
