# 决策记录: Node.js Worker 云端部署方案

> 状态: **v1.2 评审版 — 增补 reclaim / final 验证 / RPC 切换 / buildPdf 标记**
> 日期: 2026-06-10
> 决策人: SCSANITY
> 评审/整理: Codex
> 范围: `D:\IT_David\Program\Voice Imagination\Web\worker`

---

## 1. 背景与目标

当前 YMI Story 已具备完整端到端生产能力:

- 前端 Next.js 部署在 Vercel。
- Supabase 云端项目是当前生产 DB + Storage。
- RunPod Serverless 是真实 AI 生成链路。
- Worker 目前仍运行在本地 Windows 环境，负责从 Supabase 抢取 `jobs` 队列任务，执行模板准备、字幕渲染、RunPod 调用、结果上传和状态更新。

本次决策目标:

1. 让 Worker 脱离本地电脑，迁移到云端稳定运行。
2. 保留本地快速开发体验。
3. 不重构当前已跑通的生产链路。
4. 为后续多 Worker 横向扩展预留正确结构。
5. 避免本地 Worker 和云端 Worker 同时抢生产任务。

重要边界:

- 当前生产链路中，Worker **不再是最终 PDF 交付核心**。
- Final job 生成完成后进入 Admin review。
- Admin release 由 Next.js 端生成最终 PDF 并发送 final delivery email。
- Worker 直接生成 PDF 并调用 `/api/internal/worker-callback` 属于 legacy / non-review path，不是当前生产主入口。

---

## 2. 当前真实代码状态

### 2.1 Worker 入口

当前入口:

- `worker/index.ts`

启动方式:

- 本地/PM2: `ts-node index.ts`
- 当前 `worker/` 目录本身不是 git repo。
- Next.js 主仓库是 `ymi-books-web-1.0`，已连接 GitHub/Vercel。

### 2.2 当前队列模型

当前不是 `preview_jobs` / `final_jobs` 两张表分别抢单。

真实模型是:

- 主队列表: `jobs`
- 类型字段: `jobs.job_type`
  - `preview`
  - `final`
- 状态字段:
  - `queued`
  - `running`
  - `done`
  - `failed`
  - `cancelled`

Worker 当前统一调用:

```ts
supabase.rpc('claim_next_job')
```

SQL 文件:

- `Template_folder/sql_claim_next_job.sql`

当前 SQL 已使用:

```sql
for update skip locked
```

所以“原子抢单”已经存在基础版本。

### 2.3 当前 final review 表

以下表不是 worker 主队列表:

- `final_jobs`
- `final_job_pages`

它们属于 final review / admin release 状态管理:

- Worker 处理 `jobs.job_type='final'` 后，逐页写入 `final_job_pages`。
- 完成后 `final_jobs.status` 进入 review pending。
- Admin 审核、替换、release 后，Next.js 端负责最终 PDF 和邮件交付。

### 2.4 当前可观测性

Worker 已有基础运维能力:

- `/health` HTTP endpoint。
- Healthchecks.io ping。
- 当前处理 job 记录。
- 最近 claim poll 时间。
- 最近 Supabase 成功响应时间。
- 最近错误。
- PM2 restart / logrotate 本地运维说明。

因此“可观测性”不是从零开始，但云端化后仍需补 Render 日志约定、结构化日志字段和生产告警配置。

---

## 3. 决策摘要

| 编号 | 决策项 | 当前结论 |
|---|---|---|
| D1 | 托管平台 | Render Background Worker |
| D2 | 区域 | US East 优先 |
| D3 | 部署方式 | Dockerfile + Git 自动部署 |
| D4 | 队列架构 | 继续使用 Supabase Postgres `jobs` 表作为队列 |
| D5 | 抢单机制 | 加固现有 `claim_next_job` RPC，不新建 `claim_next_preview_job` / `claim_next_final_job` |
| D6 | 外部队列 | 暂不引入 SQS/RabbitMQ |
| D7 | 上云第一阶段 | 单实例 Worker，先稳定替代本地生产 Worker |
| D8 | 本地误抢保护 | 新增 `WORKER_POLL_ENABLED`，默认本地 false，云端 true |
| D9 | staging Supabase | 认可长期价值，但不作为第一阶段 blocker |

---

## 4. Render 方案判断

Render Background Worker 适合当前 Worker:

- Worker 是常驻后台进程。
- 不需要面向用户暴露 HTTP 服务。
- 需要持续轮询 Supabase。
- 需要稳定进程、日志、自动部署和环境变量管理。

Render 的优势:

- Background Worker 是一等服务类型。
- 支持 Git 自动部署。
- 支持 Dockerfile。
- 定价相对可预测。
- 迁移成本低: Worker 本质是容器化 Node 进程，将来迁移平台不需要业务重构。

注意:

- Render 具体价格和区域选项以实施当天官方页面为准。
- 如果未来成本明显高于自建 VPS 且团队有运维带宽，可重审平台。

---

## 5. 区域选择

当前外部依赖:

- RunPod: 北美。
- Vercel: 北美。
- Supabase: 当前生产项目在孟买，未来可能迁移美东。

结论:

- Worker 推荐部署 US East。

理由:

- Worker 不直接服务中国用户，用户访问延迟不是此处核心指标。
- Worker 的关键对端是 RunPod / Supabase / Vercel internal callback。
- RunPod 真实 AI 链路在北美。
- Supabase 未来若迁美东，Worker 已提前对齐目标稳态。
- 不建议为了当前 Supabase 孟买这个可能变化的状态，把 Worker 部署到印度区域。

---

## 6. 队列与抢单设计

### 6.1 保留统一 `jobs` 队列

当前代码已经围绕统一 `jobs` 表工作。

不要在第一阶段改成:

- `claim_next_preview_job`
- `claim_next_final_job`
- 独立 preview/final queue table

原因:

- 会偏离当前真实代码。
- 会增加迁移复杂度。
- final review 相关表不是队列表。
- 当前 `job_type` 已经足够区分 preview / final。

正确方向:

- 继续使用 `claim_next_job`。
- 加固其参数和字段。
- 未来如需拆分 preview/final Worker，再让同一个 RPC 支持 job type 过滤。

可选未来形态:

```sql
claim_next_job(
  p_worker_id text,
  p_job_types text[] default array['preview','final']
)
```

这样可以部署两个 Render Background Worker:

- Preview Worker: `WORKER_JOB_TYPES=preview`
- Final Worker: `WORKER_JOB_TYPES=final`

但第一阶段不需要拆。

### 6.2 当前 `claim_next_job` 已有基础原子性

当前 SQL 已使用:

```sql
for update skip locked
```

这保证多个 Worker 实例不会同时 claim 同一条 queued job。

但当前仍缺:

- worker identity
- claimed timestamp
- lease / visibility timeout
- stale running reclaim

### 6.3 推荐新增字段

对 `jobs` 表新增:

```sql
claimed_by text
claimed_at timestamptz
lease_expires_at timestamptz
```

可选:

```sql
claim_attempts integer not null default 0
```

### 6.4 推荐升级后的 claim 语义

`claim_next_job` 应该:

1. 接收 `p_worker_id`。
2. 可选接收 `p_job_types`。
3. 只 claim:
   - `status='queued'`
   - 或 `status='running' and lease_expires_at < now()` 的过期任务。
4. 使用 `FOR UPDATE SKIP LOCKED`。
5. 写入:
   - `status='running'`
   - `claimed_by=p_worker_id`
   - `claimed_at=now()`
   - `lease_expires_at=now()+interval ...`
   - `progress=max(progress,1)`
   - `updated_at=now()`

### 6.5 卡死回收不要用固定 15 分钟

Final job 是多页串行，正常耗时可能明显超过 15 分钟。

如果简单把 `running and claimed_at < now() - interval '15 minutes'` 回收，会有重复生成和 RunPod 成本浪费风险。

更合理的是 lease / heartbeat:

- claim 时给 `lease_expires_at`。
- Worker 在长任务运行期间定期续租。
- 每完成一页 final page 时也续租。
- 只有 lease 过期才允许别的 Worker reclaim。

建议环境变量:

```env
WORKER_LEASE_SECONDS=1800
WORKER_LEASE_RENEW_INTERVAL_MS=120000
```

具体值需根据真实 RunPod preview/final 耗时调优。

### 6.5.1 [v1.2 新增] reclaim 后的 resume 语义

lease + heartbeat 只解决“不要过早回收”。一旦 Worker 真的崩溃、lease 过期并被新 Worker reclaim，还需要明确新 Worker 应该如何处理已经完成的页。

当前真实代码判断:

- Preview job 当前可以接受 restart-whole-job。
  - Preview 只处理少量页面。
  - 没有逐页 Admin review 状态。
  - 重跑成本和状态复杂度都较低。
- Final job 当前代码实际更接近 restart-whole-job。
  - Worker 会按 `pageIndexList` 逐页执行 `processSinglePage()`。
  - 每页完成后会写入 `final_job_pages.status='pending_review'` 和 `ai_output_path`。
  - 但当前通用流程没有在 reclaim 后读取 `final_job_pages` 并跳过已完成页面。
  - 只有 final page rerun 场景会合并既有 `jobs.output_assets`，这不等同于崩溃恢复 resume。

v1.2 推荐语义:

- Final job reclaim 必须采用 **resume-from-last-completed-page**，不要 restart-whole-job。
- resume 依据 `final_job_pages`，而不是只看 `jobs.progress`。
- 可跳过页面的最低条件建议为:
  - `final_job_pages.final_job_id = 当前 final_job_id`
  - `page_index = 当前页面`
  - `ai_output_path is not null`
  - `status in ('pending_review', 'approved')`
- `failed` / `processing` / `needs_fix` 不应自动视为已完成。
  - `processing` 可能是崩溃遗留状态。
  - `failed` 需要重跑。
  - `needs_fix` 是人工审核后的修复状态，不应被普通 reclaim 自动覆盖，除非这是明确的 rerun job。

理由:

- 15 页 final job 的 GPU 成本明显高于 preview。
- 已完成页面已经上传到 Supabase Storage，并且有 `final_job_pages.ai_output_path` 作为可恢复事实。
- restart-whole-job 会重复烧 RunPod 时间，也可能覆盖已经进入审核状态的页面。
- resume 以 `final_job_pages` 为准，更符合当前 production review 架构。

实施要求:

- 在启用 stale running reclaim 前，先补 final job resume 逻辑。
- resume 时仍需继续 heartbeat/lease renewal。
- resume 完成后，`final_jobs.status` 仍进入 `review_pending`，Admin release 流程保持不变。

---

## 7. 本地与云端的任务隔离

### 7.1 第一阶段推荐做法

先不强制 staging Supabase 作为 blocker。

第一阶段:

- Render Worker 指向 production Supabase。
- Render 设置 `WORKER_POLL_ENABLED=true`。
- 本地 `.env` 默认 `WORKER_POLL_ENABLED=false`。
- 本地即使误连 production，也不会 claim 生产任务。
- 真要本地真实排查时，人工临时打开。

原因:

- staging Supabase 是长期正确方向，但维护成本不低。
- 需要同步 DB schema、RPC、Storage buckets、template assets、RLS、环境变量。
- 当前内测前最重要的是尽快把唯一生产 Worker 从本地电脑迁出。

### 7.2 第二阶段再建设 staging

staging Supabase 适合:

- 本地真实 job 集成测试。
- 未来多人协作。
- 上线前回归测试。
- 避免本地开发污染生产 DB/Storage。

但不应阻塞第一版 worker 上云。

---

## 8. Worker Git / Docker 部署策略

当前 `worker/` 不是 git repo，这是上云前必须处理的工程点。

两个选择:

### 方案 A: 纳入现有 GitHub repo

把 `worker/` 作为同一 GitHub repo 的子目录管理。

优点:

- 全栈代码统一管理。
- 与现有项目文档一致。
- Render 可设置 root directory / Dockerfile path。
- 方便追踪 web + worker 的接口契约变更。

风险:

- 需要整理 `.gitignore`，确保 `.env`、日志、测试图片、node_modules 不入库。
- 需要避免提交本地敏感信息。

### 方案 B: Worker 单独建 repo

优点:

- 部署边界清晰。
- Render 配置简单。

缺点:

- 全栈变更需要跨 repo 管理。
- 文档和接口契约更容易漂移。

当前建议:

- 采用方案 A。
- 但在执行前先做一次 worker 文件审计，明确哪些文件入库、哪些忽略。

### 8.1 Dockerfile 原生依赖判断

方案文档原先提到 node-canvas / cairo / pango。

当前真实依赖是:

- `@napi-rs/canvas`
- `sharp`
- `pdf-lib`
- `@supabase/supabase-js`
- `axios`
- `ts-node`
- `typescript`

`@napi-rs/canvas` 比 classic `node-canvas` 少很多系统依赖风险。

Dockerfile 仍然必要，但不应按 node-canvas 旧依赖过度安装。

Docker 目标:

- `npm ci`
- `npx tsc --noEmit`
- 启动 `node node_modules/ts-node/dist/bin.js index.ts`
- 确保 `sharp` 和 `@napi-rs/canvas` 在 Render Linux 环境可加载。

---

## 9. 环境变量与密钥收口

Render production worker 至少需要:

```env
NODE_ENV=production
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
RUNPOD_API_KEY=
WORKER_CALLBACK_URL=https://www.ymistory.com/api/internal/worker-callback
INTERNAL_API_SECRET=
WORKER_MOCK_MODE=false
WORKER_POLL_ENABLED=true
HEALTHCHECKS_URL=
```

以及当前 worker 已使用的 RunPod / workflow / timeout / compression 配置。

注意:

- `INTERNAL_API_SECRET` 必须和 Vercel production 环境一致。
- `.env` 不应提交。
- 本地 `.env.localhost` / `.env.online` 可以作为参考 profile，但生产密钥最终应由 Render 管理。
- 如果 worker 纳入 git，必须先检查 `.gitignore` 是否覆盖 `.env*`、logs、node_modules、本地测试图片。

---

## 10. 可观测性与告警

当前已有:

- `/health`
- Healthchecks.io ping
- 最近 claim / Supabase / job / error 状态

上云后建议:

1. Render 日志中输出 worker identity。
2. job claim / job done / job failed 使用结构化日志字段:
   - `worker_id`
   - `job_id`
   - `job_type`
   - `template_id`
   - `provider`
   - `duration_ms`
   - `error`
3. Healthchecks 只在 production worker 配置。
4. `/health` 在 Render Background Worker 中可能不是公网服务，但进程内健康和 Healthchecks ping 仍有价值。
5. 如果 Render Background Worker 不适合暴露 HTTP health endpoint，则保留本地 server 也无害，主要以 Healthchecks ping 和 Render process status 作为云端告警。

---

## 11. 实施顺序建议

### P0: 修正文档与部署决策

- 明确当前真实队列是统一 `jobs`。
- 明确 `claim_next_job` 已存在。
- 明确 Worker 当前不负责 admin-review final delivery email。
- 明确 staging 不阻塞第一阶段。

### P1: Worker 入 Git 前审计

输出允许入库清单:

- `index.ts`
- `processor.ts`
- `providerAdapter.ts`
- `providers/**`
- `subtitleRenderer.ts`
- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `README.md`
- `ecosystem.config.js`
- `scripts/**`
- Dockerfile / render config

必须排除:

- `.env`
- `.env.localhost`
- `.env.online` 或至少先去敏后再考虑提交示例版
- `logs/**`
- `node_modules/**`
- 本地测试 PNG
- 任何真实 key / signed URL / private token

### P2: Dockerfile 与 Render dry run

- 写 Dockerfile。
- 本地或 Render preview 构建验证。
- `npm ci`
- `npx tsc --noEmit`
- 启动 worker 但 `WORKER_POLL_ENABLED=false`。
- 验证进程启动、日志、环境变量读取、Healthchecks disabled/enabled 行为。

### P3: 加 `WORKER_POLL_ENABLED`

- 默认 false。
- 如果 false，worker 启动但不 claim job。
- `/health` 仍可运行。
- 日志明确输出 polling disabled。

### P4: 加固 `claim_next_job`

- 新增 `claimed_by` / `claimed_at` / `lease_expires_at`。
- RPC 改为 `claim_next_job(p_worker_id text, p_job_types text[] default null)`。
- [v1.2 新增] 保留无参 `claim_next_job()` 兼容入口，转发到新签名，避免旧本地 Worker 在切换期调用失败。
- Worker 启动生成或读取 `WORKER_ID`。
- Worker claim 时传 `worker_id`。
- 增加 lease/heartbeat 机制。
- [v1.2 新增] 启用 stale reclaim 前，先实现 final job `resume-from-last-completed-page`。

### P5: 单实例生产切换

- Render production worker 设置 `WORKER_POLL_ENABLED=true`。
- 本地生产 worker 停止或保持 `WORKER_POLL_ENABLED=false`。
- 触发一个 preview job。
- 验证:
  - Render 成功 claim。
  - Supabase `jobs.claimed_by` 显示 Render worker。
  - RunPod 正常执行。
  - 输出写回 Supabase。
  - 前端拿到 preview。
  - Healthchecks 正常。

[v1.2 新增] Preview 验证不足以退役本地 Worker。P5 必须额外完成一个完整 final job 端到端验证:

1. 触发真实 final job。
2. Render Worker 成功 claim `jobs.job_type='final'`。
3. Worker 逐页生成并写入 `final_job_pages`。
4. 每个目标页都有 `status='pending_review'` 和非空 `ai_output_path`。
5. `final_jobs.status` 进入 `review_pending`。
6. Admin 页面可以看到待审核页面。
7. Admin 完成审核并执行 release。
8. Next.js 端 `releaseFinalJob()` 生成最终 PDF。
9. Final delivery email 发出，并在 `email_events` 中可查。
10. 客户可通过邮件/订单页访问最终交付结果。

只有 preview 和完整 final job 都通过后，才可以正式退役本地生产 Worker。

### P6: 后续扩展

只在出现真实信号后再做:

- staging Supabase。
- preview/final worker 拆分。
- 多实例 worker。
- 外部队列。
- Supabase 区域迁移。

---

## 12. 风险与控制

| 风险 | 控制方式 |
|---|---|
| 本地误抢生产 job | `WORKER_POLL_ENABLED=false` 默认保护 |
| 多 worker 抢同一 job | `FOR UPDATE SKIP LOCKED` + RPC 原子 claim |
| Worker 崩溃导致 job 永久 running | `lease_expires_at` + reclaim |
| Final job 正常长耗时被误回收 | heartbeat 续租，不用固定短超时 |
| [v1.2 新增] Final job reclaim 后从头重跑，重复消耗 RunPod GPU | stale reclaim 启用前实现 `resume-from-last-completed-page`，以 `final_job_pages.ai_output_path` + 状态为依据跳过已完成页 |
| [v1.2 新增] 新 `claim_next_job(p_worker_id, p_job_types)` 签名破坏旧无参调用 | 选择保留向后兼容的无参重载/包装函数；旧 `claim_next_job()` 转发到新函数 |
| [v1.2 新增] 切换期本地旧 Worker 与云端新 Worker 短暂同时运行 | `FOR UPDATE SKIP LOCKED` 可保证不会抢同一 job；但两者可能各自消费不同 job，因此只允许在受控切换窗口短暂并存，验证完成后关闭本地生产 Worker |
| Render 构建原生依赖失败 | Dockerfile + build 验证 |
| 密钥泄漏 | worker 入库前审计 `.env*` 和测试文件 |
| Vercel/worker secret 不一致 | `INTERNAL_API_SECRET` 双端核对 |
| 上云后无法定位失败 | 结构化日志 + Healthchecks + Supabase job/render_runs/provider_runs |

---

## 13. 待确认问题

1. Worker 是纳入现有 GitHub repo，还是单独建 repo？
   - 建议: 纳入现有 repo，作为 monorepo 子目录。

2. 第一阶段是否接受不建 staging Supabase？
   - 建议: 接受。先用 `WORKER_POLL_ENABLED` 防误抢，staging 放第二阶段。

3. Render 是否使用 Dockerfile 部署？
   - 建议: 是。

4. 第一阶段是否只开一个 Render Worker 实例？
   - 建议: 是。内测期先单实例，观察队列积压再扩。

5. 是否现在拆 preview/final Worker？
   - 建议: 否。先统一 worker，上线稳定后按瓶颈拆。

6. 是否需要把 `.env.localhost` / `.env.online` 入库？
   - 建议: 不直接入库真实文件。可以改成 `.env.example.localhost` / `.env.example.online`，只保留变量名和假值。

7. [v1.2 新增] 当前生产 final 路径中 Worker 是否还执行 `buildPdf()`？
   - 当前真实代码判断: **admin-review 生产路径不会执行 worker `buildPdf()`**。
   - 原因:
     - 当前 final review job 会得到 `finalReviewJob`。
     - Worker 逐页写入 `final_job_pages` 后，把 `final_jobs.status` 更新为 `review_pending`。
     - `buildPdf()` 调用位于 `if (job.job_type === 'final' && !finalReviewJob)` 分支。
     - 因此当前 production review final job 会跳过该分支。
   - 结论:
     - `buildPdf()` 目前是 legacy / non-review fallback 路径能力，不是当前 admin review 交付核心。
     - 当前不应删除。
     - 建议处理清单:
       1. 在代码注释中标记该分支为 legacy / non-review path。
       2. 云端化首版继续保留，避免误伤历史或人工测试路径。
       3. 待确认没有任何生产 job 会走 `final && !finalReviewJob` 后，再单独评估删除或 feature-flag。
       4. 如果未来确认完全冗余，删除该分支可减少 legacy 复杂度，但对当前 review final job 的 RunPod 时长没有直接收益，因为当前路径本来不会执行它。

---

## 14. 最终推荐方案

推荐采用:

> Render Background Worker + Dockerfile + 统一 `jobs` 队列 + 加固现有 `claim_next_job` + 单实例先上云 + `WORKER_POLL_ENABLED` 防误抢 + 后续按信号建设 staging 和拆分 worker。

不推荐第一阶段做:

- 新建 `preview_jobs` / `final_jobs` 队列。
- 重新设计整个 job 系统。
- 立刻引入 SQS/RabbitMQ。
- 立刻拆 preview/final 两套 worker。
- 让 staging Supabase 阻塞生产 worker 上云。

核心原则:

- 先让当前已跑通的生产链路离开本地电脑。
- 不破坏现有 `jobs` / `final_jobs` / `final_job_pages` 分工。
- 把“抢单安全”和“误抢保护”补齐。
- [v1.2 新增] 启用 stale reclaim 前，先补 final job 断点续跑，避免回收后重复生成已完成页面。
- [v1.2 新增] RPC 升级采用兼容无参 `claim_next_job()` 的方式，降低切换期风险。
- 把 Docker/Git/Render 部署链路建立起来。
- 后续扩展只在真实指标触发时推进。

---

## 15. 更新日志

| 日期 | 版本 | 内容 |
|---|---|---|
| 2026-06-10 | v1.0 | 初稿，锁定 Render + 美东 + DB-as-queue 方向。 |
| 2026-06-10 | v1.1 | Codex 按当前真实代码修正: 统一 `jobs` 队列、现有 `claim_next_job` RPC、worker 当前职责、单实例优先、staging 后置、lease/heartbeat 加固。 |
| 2026-06-10 | v1.2 | 增补 reclaim resume 语义、完整 final job 验证、RPC 兼容切换风险、worker `buildPdf()` 当前生产路径判断与建议处理清单。 |
