// 简体中文语言包

const zhCN = {
  // ─── 通用 ───
  common: {
    cancel: "取消",
    confirm: "确认",
    loading: "加载中…",
    online: "在线",
    offline: "离线",
  },

  // ─── 登录页 ───
  login: {
    subtitle: "输入 Access Token 以连接",
    placeholder: "Access Token",
    invalidToken: "Token 无效，请检查后重试。",
    connect: "连接",
    tokenHint: "Token 可在 <1>~/.paimon/hub.json</1> 中找到",
  },

  // ─── 侧边栏 ───
  sidebar: {
    newInstance: "新建实例",
    instanceCount_one: "{{count}} 个实例",
    instanceCount_other: "{{count}} 个实例",
    noInstances: "暂无 pi 实例连接",
    settings: "设置",
    shutdown: "退出实例",
    statusStreaming: "生成中",
    statusCompacting: "压缩中",
    statusIdle: "空闲",
  },

  // ─── 事件流 / 对话区 ───
  eventStream: {
    tagline: "守望 · 交互 · 掌控",
    sendPlaceholder: "发送消息…",
    scrollToBottom: "滚到底部",
    stop: "停止",
    send: "发送",
    attachImage: "添加图片",
    statusRunning: "执行中",
    statusCompacting: "压缩中",
    statusOnline: "在线",
    compactContext: "压缩上下文",
    instanceNotFound: "实例不存在",
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
    contextCompacted: "上下文已压缩",
    branchSummary: "分支摘要",
    thinking: "思考",
    thinkingStreaming: "思考中...",
    running: "执行中...",
    aborted: "已终止",
    copied: "已复制",
    copy: "复制",
    result: "结果",
    params: "参数",
  },

  // ─── 错误卡片 ───
  error: {
    title: "错误详情",
    message: "错误信息",
    type: "错误类型",
    requestId: "请求 ID",
  },
} as const;

export default zhCN;

// 递归将所有叶子节点从字面量类型放宽为 string，保留 key 结构约束
type DeepStringify<T> = {
  [K in keyof T]: T[K] extends string ? string : DeepStringify<T[K]>;
};

export type LocaleResource = DeepStringify<typeof zhCN>;
