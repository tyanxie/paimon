# 对话渲染设计方案

## 数据模型

### Session Entry

pi 的 `getBranch()` 返回 `SessionEntry[]`，每个 entry 有不同 type：

| type                    | 含义           | 关键字段                        |
| ----------------------- | -------------- | ------------------------------- |
| `message`               | 对话消息       | `message: {role, content, ...}` |
| `compaction`            | 压缩摘要       | `summary`                       |
| `branch_summary`        | 分支摘要       | `summary`                       |
| `custom`                | 扩展自定义数据 | `customType`, `data`            |
| `model_change`          | 模型切换       | -                               |
| `thinking_level_change` | 思考级别切换   | -                               |
| `label`                 | 标签           | -                               |

### Message 结构

`message` entry 的 `message` 字段是 `AgentMessage`（来自 `@earendil-works/pi-ai`）：

```typescript
// 三种角色
UserMessage     { role: "user", content: string | (TextContent | ImageContent)[] }
AssistantMessage { role: "assistant", content: (TextContent | ThinkingContent | ToolCall)[] }
ToolResultMessage { role: "toolResult", toolCallId, toolName, content: (TextContent | ImageContent)[], isError, details }
```

### Content Block 类型

```typescript
TextContent     { type: "text", text: string }
ThinkingContent { type: "thinking", thinking: string }
ToolCall        { type: "toolCall", id: string, name: string, arguments: Record<string, any> }
ImageContent    { type: "image", data: string, mimeType: string }
```

## 统一 Entry 列表

浏览器只维护当前实例的 `Entry[]` 列表，由两个来源共同填充：

1. **历史刷新**：subscribe / 切换实例时请求 `get_history` → 获得当前页 `SessionEntry[]`，替换现有列表
2. **历史分页**：滚动到顶部时带 offset 请求更早 history，响应后 prepend 到列表开头
3. **实时事件**：通过 `forwarded_event` 增量更新列表

### 实时事件处理

| 事件                              | 操作                                                                  |
| --------------------------------- | --------------------------------------------------------------------- |
| `message_start`                   | 追加新 entry 到列表末尾                                               |
| `message_update`                  | 替换列表最后一条 message entry（`data.message` 是完整快照，非 delta） |
| `message_end`                     | 去掉 streaming 标记                                                   |
| `tool_execution_start/update/end` | 暂不处理（后续可在 toolCall block 下显示执行状态）                    |

### 关键点

- `message_update` 的 `data.message` 和 history 里的 `message` 是**同一种结构**（`AgentMessage`）
- 渲染层只需统一解析 `AgentMessage`，流式和历史用同一套渲染器
- 流式阶段唯一区别：最后一条 assistant message 后面显示 loading 指示

## 渲染策略

### 当前实现（v0.1 平铺）

所有 entry 平铺展示：

- `message` → 显示 role + 遍历 content blocks
- `compaction` / `branch_summary` → 一行元信息 `[type] summary`
- 未知 type → `[type]` 标记，不过滤

### 后续对话 UI（规划）

#### toolCall + toolResult 配对

当前是两条独立 entry：

1. `assistant` message，content 含 `{type: "toolCall", id: "xxx", name: "bash", arguments: {...}}`
2. `toolResult` message，`{role: "toolResult", toolCallId: "xxx", ...}`

后续渲染时通过 `toolCallId` 配对，将 toolResult 折叠在对应 toolCall 下方：

```
┌─ assistant ─────────────────────┐
│  我来执行一下...                  │
│  ┌─ bash ─────────────────────┐ │
│  │  ls -la                     │ │
│  │  ▼ 结果                     │ │
│  │  total 32                   │ │
│  │  drwxr-xr-x ...            │ │
│  └─────────────────────────────┘ │
└──────────────────────────────────┘
```

#### thinking 折叠

`ThinkingContent` 默认折叠（`<details>`），点击展开。

#### 流式指示

最后一条 streaming 中的 assistant message 末尾显示动画光标（`animate-pulse`）。

## 自动滚动

依赖当前视图状态区分 refresh、prepend 和实时更新。
覆盖场景：

- 实例切换 / 历史刷新完成 → 滚到底
- 新 entry 追加 → 用户在底部附近时滚到底
- message_update 内容增长 → 用户在底部附近时滚到底
- 加载更早历史 prepend → 通过可见内容 anchor 恢复当前位置，不滚到底
