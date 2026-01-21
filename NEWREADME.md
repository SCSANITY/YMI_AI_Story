AI Personalized Storybook Platform (Face Swap + Voice Clone)

## 1. 项目愿景 (Project Vision)
构建一个“电商 + AI 工厂”的垂直 SaaS 平台。用户选择故事书模版，上传照片（和声音），通过 AI 技术将用户生成为故事主角。

**核心产品形态：**
1.  PDF 电子书：个性化换脸。
2.  实体绘本：工业级印刷交付。
3.  有声电子书：换脸 + 声音克隆（用户录音朗读旁白）。
4.  有声实体书：实体书 + 内嵌音频芯片（需交付烧录包）。

---

## 2. 技术栈 (Tech Stack) - Full Stack TypeScript

### 2.1 前端 (Storefront & Wizard)
* **Framework**: Next.js (App Router)
* **Language**: TypeScript
* **State Management**: FSM (Finite State Machine).
* **Integration**: Supabase Client SDK.

### 2.2 数据层 (Data & Infra)
* **Core**: Supabase (PostgreSQL)
* **Auth**: Supabase Auth
* **Storage**: Supabase Storage
* **Queue**: PostgreSQL Table (`public.jobs`) - **No Redis required.**

### 2.3 AI 工厂 (The Worker)
* **Runtime**: **Node.js (TypeScript)**
* **Role**: API Orchestrator (API 编排器) and image processor
* **Logic**: Long-polling (or Webhook) on `jobs` table.
* **Integrations**: 
    * Face Swap: Replicate / Fal.ai / Midjourney API
    * Voice Clone: ElevenLabs / OpenAI API
    * PDF Gen: `pdf-lib` / `puppeteer`

---

## 3. 核心架构与数据流 (Architecture)

系统采用**双流架构**，全部使用 TypeScript 编写：

1.  **同步流 (Sync Flow)**: 用户交互、购物、查询。
    * *Path:* Client <-> Supabase API
2.  **异步流 (Async Flow)**: 任务调度与 API 调用。
    * *Path:* Client -> Insert Job -> DB -> **Node.js Worker** -> Call 3rd Party API -> Update DB -> Client (Realtime)

```mermaid
graph TD
    User[User Client] -->|1. Upload Assets| Storage[Supabase Storage]
    User -->|2. Create Draft/Order| DB[(Supabase Postgres)]
    
    subgraph Data_Layer
        DB
        Storage
    end
    
    subgraph Node_Worker_Layer
        Worker[Node.js Orchestrator]
        3rd_Party[AI APIs (Replicate/ElevenLabs)]
    end
    
    DB -- "3. Poll Job (Pending)" --> Worker
    Worker -- "4. Call API" --> 3rd_Party
    3rd_Party -- "5. Return Image/Audio" --> Worker
    Worker -- "6. Process (Crop/PDF)" --> Worker
    Worker -- "7. Upload Artifact" --> Storage
    Worker -- "8. Update Job (Success)" --> DB
    
    DB -.->|9. Realtime Update| User


## 4. 数据库设计 (Database Schema)
Supabase 是唯一事实来源。

### 4.1 
Enumsasset_type: image, audio
job_type: preview_face, full_book_pdf, voice_clone
job_status: pending, processing, success, failed

### 4.2 核心表结构
user_assets: 隐私素材 (storage_path, type)
drafts: 用户配置单 (configuration JSON)
orders: 交易记录 (status, stripe_id)
jobs: 生产队列id, job_type, input_payload, output_payload, status, worker_id

## 5. 存储策略 (Storage Policy)
Bucket Name         Access      Audience                Usage           Lifecycle
raw-private         Private     User (Own), Worker      原始素材         30天删除
public-previews     Public      Anyone                  预览图           永久
delivery-artifacts  Private     Signed URL Only         成品交付         永久

## 6. 后端worker设计

### 6.1 Node.JS Worker 的架构形态

由于 AI 生成通常比较慢（几十秒到几分钟），HTTP 连接可能会超时，通常有两种写法：

方案 A：轮询脚本 (Polling Script) - 最推荐，最稳**

在服务器（如 Railway, Render, 或一个小 EC2）上跑一个常驻的 Node 进程。

```tsx
// worker/index.ts
import { createClient } from '@supabase/supabase-js'
import { Database } from '../src/types/database.types' // 直接复用前端类型！

const supabase = createClient<Database>(...)

async function processJob(job: any) {
  try {
    // 1. 标记为处理中
    await supabase.from('jobs').update({ status: 'processing' }).eq('id', job.id)

    // 2. 调用第三方 API (比如 Replicate)
    const apiResponse = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      body: JSON.stringify({ input: job.input_payload }),
      // ... headers
    })
    
    // ... 处理 API 响应，可能需要轮询第三方 API 直到 status=succeeded ...

    // 3. 写入结果
    await supabase.from('jobs').update({ 
      status: 'success', 
      output_payload: result 
    }).eq('id', job.id)

  } catch (error) {
    // 错误处理
  }
}

async function main() {
  while (true) {
    // 抢单逻辑
    const { data: job } = await supabase.rpc('get_next_job').single()
    
    if (job) {
      await processJob(job) // 可以选择是否 await，取决于要不要并发
    } else {
      await new Promise(r => setTimeout(r, 1000)) // 没任务就休息1秒
    }
  }
}

main()
```

方案 B：Supabase Edge Functions (Serverless) - 进阶**

如果你的 AI 提供商支持 Webhook 回调（即它生成完了主动通知你），你可以完全不用常驻服务器。

1. 触发：前端插入 `jobs` 表 -> 触发 Supabase Database Webhook -> 调用 Edge Function A (Call API)。
2. 回调：AI 厂商生成完毕 -> 调用你的 Edge Function B (Webhook Handler) -> 更新 `jobs` 表。

*优缺点*：Serverless 省钱，不需要维护服务器进程。但调试 webhook 有时比较痛苦（本地不好模拟）。

### 6.2针对 Node.js Worker 的技术栈建议

既然决定用 Node.js，建议引入以下库来武装你的 Worker：

1. `axios` 或 `ky`: 比原生 `fetch` 处理重试和超时更方便。
2. `sharp`: Node.js 下最强的图片处理库。
    - *用途*：虽然 AI API 会返回图片 URL，但你可能需要把这张图下载下来，压缩、转格式、或者合成到 PDF 里，然后再上传到你自己的 Supabase Storage。`sharp` 处理这些非常快。
3. `pdf-lib`: 生成 PDF 的神器。
    - *用途*：把 AI 生成的图片和故事文字合成为最终的电子书 PDF。它支持嵌入字体，非常适合你的需求。
4. `fluent-ffmpeg`: 如果需要处理音频（比如把多段 MP3 拼接或转码），这个是 Node.js 调 FFmpeg 的标准姿势。

## 7.  开发规范 (Development Guidelines)
### 7.1 目录结构 (Monorepo-style)Plaintextroot/
├── src/                 # Next.js Frontend
│   ├── services/        # Supabase Logic
│   └── types/           # Shared Types
├── worker/              # [NEW] Node.js Backend Worker
│   ├── index.ts         # Worker Entry Point
│   ├── handlers/        # Job Processors (Face, Voice, PDF)
│   └── utils/           # Shared Utils
├── package.json         # Shared Dependencies
└── tsconfig.json

### 7.2 关键交互协议
A. 触发任务 (Trigger)Frontend 插入 jobs 表：

{
  "job_type": "preview_face",
  "input_payload": { 
    "asset_path": "raw-private/uid/face.jpg", 
    "template_id": "book-01" 
  }
}

B. Worker 处理 (Process)

1. Worker 轮询 jobs 表 (status='pending').
2. 调用 AI API (e.g. Replicate).
3. 下载结果图片，对图片进行再加工和处理。
4. 上传至 public-previews.更新 jobs 表 (status='success', output_payload={url: ...}).