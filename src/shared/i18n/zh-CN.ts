export const zhCNMain = {
  projectImport: {
    dialogTitle: '选择 Project Workspace',
    dirtyTitle: 'Dirty Workspace',
    dirtyMessage: '该 Workspace 有未提交修改。',
    dirtyDetail: '继续导入不会 stash、reset 或丢弃这些修改。',
    dirtyWarning: '该 Workspace 有未提交修改。继续导入不会 stash、reset 或丢弃这些修改。',
    alreadyRegistered: '该 Workspace 已登记为 Project，已打开现有 Project，没有创建重复记录。',
    continueAction: '继续导入',
    cancelAction: '取消',
    githubDestinationTitle: '选择 GitHub Project 的本地目录',
    githubNoticeTitle: 'Data Transfer Notice',
    githubNoticeMessage: '即将连接 GitHub 并 clone Project。',
    githubData: '数据：仓库元数据和 Git 对象写入你选择的本地 Workspace。',
    githubPermissions: '权限：使用系统 Git credential、gh 登录或操作系统凭据存储；Agent Space 不保存 token。',
    githubRecovery: '断网恢复：Workspace 保留在本地；恢复网络后可继续 fetch，不会重复 clone。',
    githubContinueAction: '继续连接 GitHub'
  },
  projectOpen: {
    error: '没有找到可用的外部 IDE。请安装并启用 IDE 的命令行启动器。'
  },
  projectDelete: {
    title: '删除 Project',
    message: '删除只会移除 Agent Space 中的 Project 登记，不会删除本地 Workspace 目录或其中任何文件。',
    detail: '不会删除本地 Workspace 目录或其中任何文件，也不会移动、清空 Git 分支、worktree 或 Artifact。',
    confirmAction: '删除 Project',
    cancelAction: '取消',
    approvalRequired: '删除 Project 需要明确的用户确认。',
    activeRunError: '该 Project 有进行中的 Workflow Run，请先暂停、取消或完成 Run 后再删除。',
    notFound: '找不到这个 Project。',
    unavailable: 'Project 删除功能暂不可用。'
  },
  workflowRun: {
    runtimeBlocked: 'Runtime 报告当前 Step blocked。',
    workspaceUnavailable: 'Project Workspace 不可访问。',
    workflowInvalid: (errors: string) => `Project Workflow Validation 失败：${errors}`,
    ideaRequired: 'Idea 不能为空。',
    workspaceAvailable: 'Project Workspace 可访问。',
    workflowValid: 'Project Workflow Validation 通过。',
    ideaFilled: 'Idea 已填写。',
    fakeStepMissing: 'Workflow Step 不存在。',
    fakeFailure: 'fake Runtime 模拟失败。',
    runtimeInvalid: 'Runtime 未报告有效的终态。',
    fakeQuestion: (step: string) => `请确认：${step}`,
    nextAction: {
      running: '等待 Runtime 完成当前 Step。',
      paused: 'Workflow Run 已暂停。',
      waiting: '等待用户处理当前 Step。',
      blocked: 'Workflow Run 已 blocked，需要处理阻塞原因。',
      failed: '当前 Step 失败，可重试。',
      cancelled: 'Workflow Run 已取消。',
      completed: 'Workflow Run 已完成。'
    }
  },
  codexSession: {
    capabilityNegotiationFailed: (command: string, version: string, missing: string) => `Codex App Server 能力协商失败（路径：${command}；版本：${version}；缺失能力：${missing}）。请更新本机 Codex CLI 后重试。`,
    capabilitySuggestion: '请安装或更新 Codex CLI，使其支持所需的 App Server 方法和事件。',
    preflightSuggestion: '请确认本机已安装并登录 Codex CLI，然后更新到支持 App Server 的版本。',
    approvalExpired: 'Runtime Approval 请求已失效，无法响应原始请求。',
    approvalContinuationExpired: 'Runtime Approval 请求已失效，无法继续原始 Turn。',
    invalidApprovalDecision: (method: string) => `Runtime Approval 响应无效（${method}）：必须是 Codex 支持的 decision。`,
    turnClosed: 'Codex App Server 在 Turn 完成前关闭。',
    missingThreadId: 'Codex App Server 未返回 Thread ID。',
    missingTurnId: 'Codex App Server 未返回 Turn ID。',
    invalidThreadHistory: 'Codex App Server 返回的 Thread 历史无效。',
    missingTurnHistory: 'Codex App Server 未返回指定的 Turn 历史。',
    turnNotActive: '当前 Runtime Turn 不可中断。'
  },
  codexRuntime: {
    cliAvailable: 'Codex CLI 可用。',
    cliUnavailable: 'Codex CLI 不可用。',
    credentialsAvailable: 'Codex 凭据可用。',
    credentialsUnavailable: 'Codex 凭据不可用。',
    fixedSkillUnavailable: (name: string, version: string) => `固定 Skill ${name}@${version} 不可用。`,
    fixedSkillAvailable: (name: string, version: string) => `固定 Skill ${name}@${version} 可用。`,
    fixedSkillReadFailed: (reason: string) => `无法读取固定 Skill：${reason}`,
    transferNotice: (permissions: string) => `Data Transfer Notice：External Destination: Codex Agent Runtime；发送 Idea、Phase Context、Artifact、Decision Record；权限：${permissions}；断网后从持久化 Step Execution 恢复。`,
    capabilityNegotiated: (command: string, version: string) => `Codex App Server 能力协商通过（${command} ${version}）。`,
    capabilityUnavailable: (missing: string) => `Codex App Server 能力不可用：${missing}`,
    runtimeApproval: (command: string, method: string) => `Runtime Approval：${command || method}`,
    unknownServerError: 'Codex App Server 返回未知错误。',
    turnFailed: 'Codex Turn 执行失败。',
    permissionBlockedGit: 'Permission Policy 阻止 Git 操作。',
    capabilitySource: 'codex capability negotiation',
    appServerSource: 'codex app-server'
  }
} as const
