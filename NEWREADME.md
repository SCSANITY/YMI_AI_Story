# AI Personalized Storybook Platform (Face Swap + Voice Clone)

## 1. 项目愿景 (Project Vision)
构建一个“电商 + AI 工厂”的垂直 SaaS 平台。用户选择故事书模版，上传照片（和声音），通过 AI 技术将用户生成为故事主角。

**核心产品形态：**
1.  **PDF 电子书**：个性化换脸。
2.  **实体绘本**：工业级印刷交付。
3.  **有声电子书**：换脸 + 声音克隆（用户录音朗读旁白）。
4.  **有声实体书**：实体书 + 内嵌音频芯片（需交付烧录包）。

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
* **Role**: API Orchestrator (API 编排器)
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

4.1 
Enumsasset_type: image, audio
job_type: preview_face, full_book_pdf, voice_clone
job_status: pending, processing, success, failed

4.2 核心表结构
user_assets: 隐私素材 (storage_path, type)
drafts: 用户配置单 (configuration JSON)
orders: 交易记录 (status, stripe_id)
jobs: 生产队列id, job_type, input_payload, output_payload, status, worker_id

5. 存储策略 (Storage Policy)
Bucket Name         Access      Audience                Usage           Lifecycle
raw-private         Private     User (Own), Worker      原始素材         30天删除
public-previews     Public      Anyone                  预览图           永久
delivery-artifacts  Private     Signed URL Only         成品交付         永久


6. 开发规范 (Development Guidelines)6.1 目录结构 (Monorepo-style)Plaintextroot/
├── src/                 # Next.js Frontend
│   ├── services/        # Supabase Logic
│   └── types/           # Shared Types
├── worker/              # [NEW] Node.js Backend Worker
│   ├── index.ts         # Worker Entry Point
│   ├── handlers/        # Job Processors (Face, Voice, PDF)
│   └── utils/           # Shared Utils
├── package.json         # Shared Dependencies
└── tsconfig.json

6.2 关键交互协议
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
3. 下载结果图片，合成水印。
4. 上传至 public-previews.更新 jobs 表 (status='success', output_payload={url: ...}).