# 对话数据与展示模型

## 原始条目

`useConversation` 管理当前实例的历史条目、流式消息和实时工具状态。

`SessionEntry` 的共享类型位于 `src/web/src/stores/types.ts`，保留消息的 `id`、`timestamp`、`message`、系统摘要和其他原始字段。没有 `id` 的实时条目使用前端生成的 `__renderKey`；组件通过 `getSessionEntryRenderKey()` 获取稳定身份。

主要消息类型：

- `user`：文本或包含文本、图片的 content blocks。
- `assistant`：包含 text、thinking 和 toolCall 的 content blocks。
- `toolResult`：通过 `toolCallId` 关联工具，保留 content、isError、details 与可用的 durationMs。
- `compaction` / `branch_summary`：通过条目自身的 summary 展示系统摘要。

## 历史与实时状态

- 首次加载、重新连接与 session 切换时获取历史。
- 加载更早历史时，将返回的原始条目添加到当前历史之前。
- `message_start` 为 assistant 建立独立的流式条目。
- `message_update` 使用完整消息快照更新流式条目；缺少开始事件时也能建立条目。
- `message_end` 将消息添加到已完成条目，并保留流式阶段的渲染 key。
- 实时消息采用现有事件的时间，更新与结束时保留首次开始或隐式更新事件的时间；独立结束的消息采用对应结束事件时间。
- `tool_execution_start/update/end` 按 `toolCallId` 更新顶层工具状态。
- 部分工具结果使用最新快照；结束事件提供最终结果、错误和耗时。
- 历史或实时 `toolResult` 到达后，对应工具由历史结果提供展示数据。

对外提供的 `entries` 包含已完成条目及当前流式条目。分页 offset 使用内部已完成条目的数量，流式条目和展示分组均不影响 offset。

## 派生展示模型

`useConversationDisplay` 位于 `src/web/src/components/InstanceView/useConversationDisplay.ts`，由 `useConversation` 调用并通过 `displayItems` 暴露。转换函数为 hook 内部实现，输入保持只读。

共享类型使用 discriminated union：

- `ConversationItem`：独立用户消息、agent 回复或系统事件。
- `ConversationReply`：保留范围内的原始条目，以及按顺序排列的正文、执行汇总、系统事件与消息错误。
- `ConversationExecution`：连续的 thinking 和工具调用，以及各个工具状态的数量。
- `ConversationSource`：保留原始 entry、content block 位置、稳定 key 和流式标记。
- `ConversationToolState`：运行中、完成、失败、终止或未知状态。

### 回复范围

用户消息独立展示，其后直到下一条用户消息之前的 assistant 内容组成一个回复。缺少前置用户的 assistant 内容仍有独立回复身份。

回复优先以对应用户的稳定 key 命名；缺少用户时使用第一条 assistant 的稳定 key。完整历史轮次追加、流式内容增长和最终消息转换保持已有回复身份。

### 连续执行区域

- thinking 和工具调用按原始 content block 顺序进入执行区域。
- 连续工具可跨 assistant 消息合并，toolResult 只更新对应工具。
- 有内容的正文结束当前执行区域，后续工具建立新的区域。
- 用户消息、系统摘要和消息错误形成执行区域边界。
- thinking 单独标识，其数量与工具数量分别处理。
- 工具按独立 `toolCallId` 去重。

因此，工具汇总 A → 正文 A → 工具汇总 B → 正文 B 的顺序完整保留。

### 工具结果与状态

历史 toolResult 优先提供最终结果；其次使用实时结束事件。明确的终止消息结束其所在回复内的未完成工具。明确收到开始或更新事件的工具可以显示运行中状态；缺少这些信息的历史工具保持未知状态。实例 `idle` 时，缺少最终结果的工具使用未知状态，并结束运行指示与计时。

结果归属按 toolCallId 保持稳定，包括跨正文、系统事件或用户消息返回的结果。工具参数、部分输出、错误、details 和已有 durationMs 保持原有数据含义。

### 稳定身份与时间

执行区域使用其首个内容项的稳定 key，工具使用 toolCallId。正文与 thinking 保留原始条目 key 和 block 位置，最终结果交接保持这些身份。

消息时间从原始 entry 读取，工具耗时从已有结果读取；具体时间格式、折叠状态和弹窗状态由展示组件负责。

## 页面与滚动

页面通过 `ConversationList` 渲染 `displayItems`。回复采用 24px 圆角中性半透明容器，正文与执行汇总按原始顺序展示；执行汇总默认收起，展开后可分别查看 thinking 和工具详情。整组回复、执行汇总和 thinking 各自管理开关，用户选择在实时更新与结果交接后保持稳定，实例或 session 切换时重置。

共享 `Collapsible` 使用 Motion 的 `LazyMotion` 和 `m` 管理高度与透明度，减少动态效果时直接切换状态。折叠后保留已展示组件的身份，并通过 `inert` 和 `aria-hidden` 限制焦点及辅助技术访问；首次展开工具列表与 thinking 时建立对应内容。

消息时间通过 hover、聚焦或点击入口查看，回复提供首个与最后一个已有时间，内部消息保留自身时间。系统摘要支持完整内容查看，重新编辑入口位于最新回复标题区。运行与压缩反馈显示在回复附近，输入区保留上下文用量及发送／停止操作。

顶部栏通过一个 `header-material` 容器覆盖右侧区域全宽，实例信息与 session 操作共同位于其中；`InstanceHeader` 负责内部内容。正文与输入区各自保持 920px 阅读宽度。`Composer` 采用单个圆角容器，通过 640px container query 管理辅助选项的显示位置；上下文提供紧凑百分比与完整用量，压缩后 tokens 暂缺时表达等待更新状态。顶部与输入区的尺寸观察继续为对话留白提供实际高度，实例或 session 切换时重置输入区局部弹层状态。

`useScrollAnchor` 使用原始 entries 管理分页，展示元素提供稳定的 `data-entry-key` 作为阅读位置入口。首次加载或 session 切换后滚动到底部；用户位于底部附近时跟随新内容，浏览较早消息时保持阅读位置。折叠前调用 `prepareForContentResize`，内容尺寸变化时保持点击入口的位置，用户继续滚动后恢复正常滚动。完整布局和后续动画要求见 [Web 视觉重构方案](web-visual-redesign.md)。

## 验证

单元测试覆盖回复范围、连续执行、thinking 顺序、系统事件、错误、工具状态、结果归属、稳定 key、原始数据保留、分页 offset、独立折叠状态、阅读位置、消息时间与详情交接。

Agent 负责单元测试、类型检查和构建。真实浏览器加载、视觉和实际交互由用户验证，整体检查清单见 [Web 整体验证](web-validation.md)。
