# YMI Story 内测前短期计划

Last updated: 2026-05-26

## 当前阶段

项目已经具备完整跑通的全栈生产能力，功能性已满足内测前要求。

已经验证过的主链路：
- 前端网页 UX 和主要业务页面。
- Preview job / Final job 相关逻辑。
- RunPod AI workflow 接通与实际换脸测试。
- Worker 逐页处理、上传结果、写回 Supabase。
- Admin 页面审核、批准、放行。
- Final PDF 生成。
- Resend 自动邮件发送。

当前阶段不是核心功能开发，而是内测前打磨：内容质量、正式网站体验、真实支付流程、以及小规模用户测试准备。

## 内测目标

- 测试小规模并发下的网页体验和 job 处理稳定性。
- 验证真实用户从上传照片到收到 PDF 的完整体验。
- 验证 Stripe Live 真实付款流程。
- 收集 UIUX、故事内容、换脸质量、邮件交付和整体购买体验反馈。

## 任务追踪

| 模块 | 状态 | 当前进度 | 负责人 | 说明 |
| --- | --- | --- | --- | --- |
| 首批 8 本故事内容准备 | In Progress | 5/8 | David | 逐本进行换脸测试、prompt 微调、`config.json` 调整和 Supabase 同步。 |
| 后续 7 本故事扩展 | Pending | 0/7 | David | 计划在内测期间持续推出，不阻塞首轮内测。 |
| UIUX 正式化 | Pending | 待开始 | Codex | 清理 demo 页面残留内容，替换为正式网站文案和体验。 |
| Stripe Live 接入 | Pending | 公司注册已完成，尚未接入 live key | Codex + David | 内测前希望体验真实付款流程；本地继续保留 test key。 |
| 8 本故事 config 批量辅助修改 | Blocked/Waiting | 等待具体指令 | Codex | 由 David 完成单本测试判断后，再按明确指令批量修改。 |
| 内测前真实链路复测 | Pending | 待故事和 Stripe 准备后执行 | Codex + David | 复测真实 preview、final、Admin release、PDF 邮件交付。 |

## 近期执行顺序

1. David 继续完成首批 8 本故事的换脸效果测试和 prompt/config 微调。
2. Codex 同步推进 UIUX 正式化清理，优先处理 demo 文案和明显非正式内容。
3. Stripe Live 条件就绪后，Codex 指导并协助切换 Vercel production live key；本地环境保留 test key。
4. David 给出具体故事 config 修改要求后，Codex 执行批量修改和一致性检查。
5. 首批 8 本故事与真实支付准备完成后，执行内测前完整验收链路。

## 验收标准

进入首轮内测前，至少满足：
- 首批 8 本故事中准备上线的故事 config 已同步至 Supabase。
- 网站主要页面没有明显 demo/占位内容。
- Stripe Live 在 Vercel production 环境配置完成并通过真实付款流程验证。
- 本地/dev 仍可使用 Stripe test key。
- Worker real mode 可以完成真实 preview 和 final job。
- Admin 可以审核、批准、release。
- 客户能收到包含可用 PDF 链接的邮件。

## 当前约束和边界

- `Template_folder` 中故事文件是本地备份；运行时以 Supabase 中的模板/config 为准。
- Mock mode 继续保留，用于低成本 UIUX 测试。
- RunPod Docker / Endpoint / Volume 由另一条工作流负责；本项目代码侧只维护接口契约和调用逻辑。
- 本计划是阶段性短期文件。内测准备完成后，可以归档、删除，或合并进 `PROJECT_STATUS_AND_ROADMAP.md`。

