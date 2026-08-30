export const zhCNMain = {
  projectImport: {
    dialogTitle: '选择 Project Workspace',
    dirtyTitle: 'Dirty Workspace',
    dirtyMessage: '该 Workspace 有未提交修改。',
    dirtyDetail: '继续导入不会 stash、reset 或丢弃这些修改。',
    dirtyWarning: '该 Workspace 有未提交修改。继续导入不会 stash、reset 或丢弃这些修改。',
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
  }
} as const
