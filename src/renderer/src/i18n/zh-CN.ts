export const zhCN = {
  app: {
    name: 'Agent Space',
    primaryNavigation: '主导航',
    workspace: '工作空间',
    localMode: '本地模式'
  },
  navigation: {
    projectOverview: 'Project 概览',
    settings: '设置'
  },
  projectOverview: {
    eyebrow: 'Project 概览',
    count: '0 个 Project',
    title: '还没有 Project',
    description: '创建一个新的 Project，或恢复之前未完成的工作。',
    createAction: '创建 Project',
    resumeAction: '恢复工作'
  },
  projectEntry: {
    createEyebrow: '新建 Project',
    createTitle: '创建 Project',
    resumeEyebrow: '恢复工作',
    resumeTitle: '恢复工作',
    backAction: '返回 Project 概览'
  },
  settings: {
    eyebrow: '设置',
    title: '设置',
    description: '管理 APP 的运行环境与偏好。',
    runtimeSection: '运行环境',
    runtimeDescription: '当前 Desktop Shell 的本地运行信息。',
    operatingSystem: '操作系统',
    appVersion: 'APP 版本',
    loading: '读取中...'
  },
  platform: {
    darwin: 'macOS',
    linux: 'Linux',
    win32: 'Windows'
  }
} as const
