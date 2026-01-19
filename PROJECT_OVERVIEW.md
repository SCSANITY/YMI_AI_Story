🧠 AI Comic Books · 系统级架构与工具选型总览（Project Overview）
0. 项目一句话定义（Very Important）

AI Comic Books 是一个以「Job 异步流水线」为核心的 AI 定制化内容生成平台，
前端只负责用户意图，后端 Worker 负责系统编排，
AI 仅作为被调用的计算模块存在。

1. 整体系统分层（先看大图，不看细节）
┌────────────────────────────────────┐
│            Frontend (UIUX)         │
│   Next.js / Web App (To C)         │  用户在前端的操作会触发创建新的job记录，然后会将客户上传的资料如头像和音频传至DB
└───────────────┬────────────────────┘
                │  create / poll jobs
                ▼
┌────────────────────────────────────┐
│        Backend System Layer        │
│  (Database + Auth + Payment + API) │  job信息以及对应的信息存在DB中，worker从DB获取job信息然后抓取对应的信息如头像和音频
└───────────────┬────────────────────┘
                │  job queue / status
                ▼
┌────────────────────────────────────┐
│          Worker / Orchestrator     │
│   Node.js (Async Job Processor)    │   worker根据抓取到的信息去调用故事template并将抓取到的job对应的头像和音频上传至AI
└───────────────┬────────────────────┘
                │  AI calls
                ▼
┌────────────────────────────────────┐
│        AI Execution Layer          │
│  Segmind Workflow / AI APIs        │   AI这边完成换脸换声等操作之后会将内容返回至worker再回到DB，然后前端再从DB抓取结果反馈显示
└────────────────────────────────────┘




2. 前端（Frontend / UIUX）
技术选型

Framework：Next.js（App Router）

Hosting（首选）：Vercel

可选 / 备用：GitHub Pages（仅静态 Demo，不适合最终产品）

职责边界（非常重要）

前端不做计算，不做 AI，不做业务决策，只负责：

用户浏览（Landing / Books / Preview）

记录用户输入（图片、名字、语言等）

创建 Job（写 DB）

轮询 Job 状态

渲染 output_manifest

📌 前端不依赖文件路径结构
📌 前端永远通过 manifest 展示结果

3. 数据库 & 后端平台（Backend Platform）
核心选择

Supabase

PostgreSQL（主数据库）

Auth（用户体系）

Storage（图片 / PDF）

为什么是 Supabase

本质是 标准 PostgreSQL

不锁死供应商

支持随时迁移到 AWS RDS

自带 Auth / Storage / RLS，极大降低系统复杂度

📌 当前阶段目标：产品成熟度 > 云厂商纯度

4. 后端核心思想：Job-based Architecture
Job 是什么？

Job 是一次不可逆的系统事实（System Fact）

由前端创建

由 Worker 抢占

状态机驱动（queued → processing → done / failed）

不重试、不回滚

为什么必须用 Job

AI 任务耗时、不可预测

避免前端阻塞

支持失败隔离

支持进度追踪

5. Worker（系统真正的“大脑”）
技术选型

Node.js Worker（独立进程 / 服务）

可部署在：

本地

AWS EC2

AWS ECS / Lambda（未来）

Worker 的唯一职责

Worker 是系统的 Orchestrator（编排者）

具体负责：

抢占 Job

准备输入（模板、图片、参数）

调用 AI（Workflow / API）

后处理（字幕、出血位、PDF）

生成 output_manifest

更新 Job 状态

📌 Worker 是唯一允许写 system facts 的角色

6. AI 执行层（AI Execution Layer）
当前选择

Segmind AI Workflow

核心原则（非常重要）

AI Workflow = 模型编排层

不接 DB

不知道 Job / User / Order

对 Worker 来说是一个 黑盒 API

典型 AI 链
Faceswap
 → Enhance / Upscale


📌 字幕、出血位、PDF 不进入 AI Workflow

7. 支付系统（Payments）
当前选择

Stripe

支付策略

一次性支付（One-time payment）

Webhook 驱动订单状态更新

不做复杂订阅（Phase 1）

Stripe 在系统中的角色

产生付款事实

驱动 orders 状态机

不参与 AI / Job 逻辑

8. 数据收集 & 分析（Data & Analytics）
为什么必须考虑（不是“以后再说”）

分析哪本书卖得好

哪个年龄段转化高

哪一步用户流失

数据来源

Supabase 数据库：

users

jobs

orders

products

初期策略（现实）

直接 SQL / Dashboard

不急着上复杂 BI

结构先对，工具可换

9. 云与基础设施（Cloud & Infra）
当前策略：混合 + 渐进

前端：Vercel

数据库 / Auth / Storage：Supabase

Worker / 计算：AWS（可选 / 逐步）

AI：Segmind（暂定）

📌 架构允许未来：

Supabase → AWS RDS

Segmind → 自建 / 其他 AI API

Worker 横向扩展

10. 对 Codex / AI 工程助手的“系统契约”（非常重要）

当你让 Codex 写代码时，它必须遵守：

前端不直接调用 AI

所有 AI 调用由 Worker 触发

所有输出通过 output_manifest 暴露

Job 是一次性事实

AI Workflow 是黑盒

数据库是 Single Source of Truth