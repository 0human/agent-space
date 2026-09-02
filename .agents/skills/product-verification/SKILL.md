---
name: product-verification
description: 验证所有 Implementation Ticket 集成后的完整产品，不重复单 Ticket Review。
disable-model-invocation: true
---

根据规格与 Implementation Ticket 累计结果验证完整产品。

- 运行适用于整个产品的 typecheck、全量测试、build 和端到端检查。
- 检查跨 Ticket 集成、用户验收场景和最终可运行产物。
- 将失败归因到具体 Ticket、集成边界或产品配置，并报告可复现证据。
- 单 Ticket 的代码 Review 与 Commit 已在 Implementation Phase 完成；本阶段只验证产品级结果。

完成时输出适用的 `check-result`、`test-result` 或其他产品验证 Artifact。
