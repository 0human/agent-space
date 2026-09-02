# Run Board 作为 Workflow 状态的操作投影

Run 主界面采用 Jira 风格的 Run Board：以 Phase 为列、以 Step 或 Approval Gate 为卡片，并在详情面板展示 Phase Context、Artifact、日志和待处理决定。Run Board 从 Run Snapshot 和 Step Execution 投影状态，不拥有独立任务数据，也不能绕过 Workflow Definition 随意改变状态。这样用户获得可扫描、可操作的工作视图，同时保持 Workflow 引擎作为唯一状态来源。

## Status

superseded by ADR-0018
