// 简体中文语言包

const zhCN = {
  // ─── 通用 ───
  common: {
    cancel: "取消",
    close: "关闭",
    confirm: "确认",
    loading: "加载中…",
    online: "在线",
    offline: "离线",
  },

  modal: {
    content: "详情内容",
  },

  imagePreview: {
    title: "图片预览",
    close: "关闭预览",
    actualSize: "原始尺寸",
    fitWindow: "适应窗口",
  },

  // ─── 登录页 ───
  login: {
    subtitle: "输入 Access Token 以连接",
    placeholder: "Access Token",
    invalidToken: "Token 无效，请检查后重试。",
    connect: "连接",
    verifying: "验证中…",
    tokenHint: "Token 可在 <1>~/.paimon/hub.json</1> 中找到",
  },

  // ─── 侧边栏 ───
  sidebar: {
    newInstance: "新建实例",
    machine_one: "{{count}} 台机器",
    machine_other: "{{count}} 台机器",
    instance_one: "{{count}} 个实例",
    instance_other: "{{count}} 个实例",
    noInstances: "暂无 pi 实例连接",
    settings: "设置",
    shutdown: "退出实例",
    shutdownBusy: "实例正在执行中，请等待完成后再退出",
    statusStreaming: "执行中",
    statusCompacting: "压缩中",
    statusIdle: "空闲",
    statusPending: "状态等待更新",
  },

  navigation: {
    brand: "Paimon",
    main: "主导航",
    home: "首页",
    instances: "实例",
    connection: "连接状态",
    backToInstances: "返回实例列表",
    copyEdge: "复制 Edge：{{edgeId}}",
    instanceActions: "{{name}} 的实例操作",
  },

  composer: {
    options: "输入选项",
    images: "图片",
    modelWaiting: "模型等待更新",
    thinkingLabel: "思考",
    pendingThinking: "等待更新",
    unsupportedThinking: "不支持",
    compact: "压缩",
    compactBusy: "任务运行期间暂不可压缩",
    compactUnavailable: "上下文用量更新后可压缩",
    resizeHeight: "调整输入区高度",
    resizeHeightHelp:
      "拖动调整高度；双击或 Home 恢复自动高度；上下方向键调整，End 展开到最大高度",
    heightPixels: "{{height}} 像素",
    model: "选择模型",
    thinkingLevel: "思考等级",
    contextUsage: "上下文用量",
    usedTokens: "已用 tokens",
    contextWindow: "上下文窗口",
    pendingUsage: "等待更新",
    pendingUsageDescription: "上下文用量将在下一次响应后更新",
    previewImage: "预览附加图片 {{count}}",
    removeImage: "移除附加图片 {{count}}",
  },

  // ─── 事件流 / 对话区 ───
  eventStream: {
    tagline: "守望 · 交互 · 掌控",
    sendPlaceholder: "发送消息…",
    scrollToBottom: "滚到底部",
    stop: "停止",
    send: "发送",
    attachImage: "添加图片",
    imageProcessFailed: "图片处理失败，请检查图片格式",
    compactContext: "压缩上下文",
    instanceNotFound: "实例不存在",
  },

  conversation: {
    agentName: "Pi",
    you: "你发送的消息",
    approximateDuration: "约耗时 {{duration}}",
    durationMilliseconds: "{{value}} 毫秒",
    durationSeconds: "{{value}} 秒",
    durationMinutes: "{{value}} 分",
    durationHours: "{{value}} 小时",
    durationDays: "{{value}} 天",
    compactingContext: "正在整理上下文",
    attachedImage: "附加图片 {{count}}",
    expandExecution: "展开工具与思考过程",
    collapseExecution: "收起工具与思考过程",
    toolDetails: "查看 {{name}} 工具详情",
    moreToolTypes_one: "另外 {{count}} 种工具",
    moreToolTypes_other: "另外 {{count}} 种工具",
    thinkingCount_one: "{{count}} 段思考过程",
    thinkingCount_other: "{{count}} 段思考过程",
    thinkingStreamingCount_one: "{{count}} 段思考过程，思考中",
    thinkingStreamingCount_other: "{{count}} 段思考过程，思考中",
    toolsPending_one: "{{count}} 个工具准备中",
    toolsPending_other: "{{count}} 个工具准备中",
    toolsRunning_one: "{{count}} 个工具执行中",
    toolsRunning_other: "{{count}} 个工具执行中",
    toolsCompleted_one: "{{count}} 个工具执行完成",
    toolsCompleted_other: "{{count}} 个工具执行完成",
    toolsFailed_one: "{{count}} 个工具执行失败",
    toolsFailed_other: "{{count}} 个工具执行失败",
    toolsAborted_one: "{{count}} 个工具已终止",
    toolsAborted_other: "{{count}} 个工具已终止",
    toolsUnknown_one: "{{count}} 个工具结果不可用",
    toolsUnknown_other: "{{count}} 个工具结果不可用",
    toolPending: "准备中",
    toolCompleted: "执行完成",
    toolFailed: "执行失败",
    toolUnknown: "结果不可用",
    toolUnavailableDescription: "未收到工具结果或执行记录。",
    replyFailed: "回复失败",
    replyStart: "开始",
    replyEnd: "最后更新",
    loadingEarlier: "正在加载更早的消息…",
    loadingConversation: "正在加载对话",
    loadFailed: "对话加载失败",
    noMessages: "暂无消息",
    instanceInfo: "实例信息",
  },

  // ─── 压缩弹窗 ───
  compact: {
    title: "压缩上下文",
    description:
      "压缩将总结旧的对话内容以释放上下文空间。可选填自定义提示词来指定压缩时关注的方向。",
    placeholder: "例如：重点保留关于数据库设计的讨论…",
    start: "开始压缩",
  },

  // ─── 设置页 ───
  settings: {
    title: "设置",
    appearance: "外观",
    theme: "主题",
    themeLight: "浅色",
    themeDark: "深色",
    themeSystem: "系统",
    background: "背景",
    bgMist: "雾",
    bgAurora: "极光",
    bgEmber: "余烬",
    language: "语言",
    langZhCN: "简体中文",
    langEn: "English",
  },

  // ─── 通知 ───
  notification: {
    title: "通知",
    label: "任务完成通知",
    on: "开启",
    off: "关闭",
    denied: "通知权限已被浏览器拒绝，请在浏览器设置中允许",
    taskComplete: "✅ {{name}} 任务完成",
  },

  // ─── 新建实例弹窗 ───
  newInstance: {
    title: "新建实例",
    edgeNode: "Edge 节点",
    noEdges: "没有可用的 Edge 节点",
    workingDir: "工作目录",
    pathPlaceholder: "/path/to/your/project",
    create: "创建",
    creating: "创建中…",
    truncatedHint: "输入更多字符以缩小范围…",
    fetchEdgeError: "获取 Edge 列表失败",
    noEdgeSelected: "未选择 Edge 节点",
    requestTimeout: "请求超时",
    networkError: "网络错误",
    requestFailed: "请求失败 (HTTP {{status}})",
  },

  // ─── Session 面板 ───
  session: {
    title: "Sessions",
    new: "新建",
    filter: "筛选…",
    noMatch: "无匹配的 Session",
    noPrevious: "暂无历史 Session",
    empty: "空 Session",
    messageCount_one: "{{count}} 条消息",
    messageCount_other: "{{count}} 条消息",
    timeJustNow: "刚刚",
  },

  // ─── 消息条目 ───
  entries: {
    code: "代码",
    contextCompacted: "上下文已压缩",
    branchSummary: "分支摘要",
    thinking: "思考",
    thinkingStreaming: "思考中...",
    running: "执行中...",
    aborted: "已终止",
    copied: "已复制",
    copy: "复制",
    mermaidDiagram: "Mermaid 图表",
    mermaidExpand: "放大查看",
    mermaidLoading: "图表生成中…",
    mermaidError: "图表渲染失败，以下为源码",
    result: "结果",
    output: "输出",
    executionDuration: "执行耗时",
    waitingDuration: "调用等待时间",
    timeout: "超时时间",
    params: "参数",
  },

  // ─── 重新编辑 ───
  reEdit: {
    button: "重新编辑",
    draftNotEmpty: "输入框已有内容，请先清空",
  },

  // ─── 错误卡片 ───
  error: {
    title: "错误详情",
    message: "错误信息",
    type: "错误类型",
    requestId: "请求 ID",
    action: {
      compact: "压缩失败：{{message}}",
    },
  },
} as const;

export default zhCN;

// 递归将所有叶子节点从字面量类型放宽为 string，保留 key 结构约束
type DeepStringify<T> = {
  [K in keyof T]: T[K] extends string ? string : DeepStringify<T[K]>;
};

export type LocaleResource = DeepStringify<typeof zhCN>;
