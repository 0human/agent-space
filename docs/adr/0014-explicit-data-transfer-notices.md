# 联网步骤显示 Data Transfer Notice

每个需要联网或向 External Destination 传输数据的 Step，在开始前都要展示 Data Transfer Notice：目标服务、将发送的数据类型（可包含 source code、Artifact 或 Phase Context）、所需权限和断网后的恢复方式。用户已授权的 GitHub push/PR 和远程 Agent Runtime 请求可以继续执行，但 APP-owned Server 上传和未授权遥测仍被禁止。这样用户可以区分“为完成工作而授权的外部操作”和“产品方收集数据”。

## Status

accepted
