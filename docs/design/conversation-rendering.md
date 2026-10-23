# 对话数据与展示原则

## 数据来源

对话使用 Pi 提供的历史消息、流式消息、工具执行事件与实例状态。原始条目保留消息身份、内容、时间、图片、工具参数与结果等信息，派生展示保持这些信息的含义。

已完成历史与流式消息分别管理。加载更早历史时使用已完成的原始条目数量作为分页 offset，展示分组和当前流式消息均不影响分页。

## 回复与执行区域

- 用户消息独立展示，其后的 assistant 内容组成回复；系统事件结束当前可见回复，后续 assistant 内容继续独立展示。
- 连续 thinking 与工具调用可跨 assistant 消息进入执行区域，正文、用户消息和系统事件形成区域边界。
- 工具汇总与正文保持原始顺序，thinking 单独标识，系统摘要与错误保留所在位置。空字符串、纯空白及仅有 signature 的 thinking 保留原始数据，展示时省略其条目与空执行区域。
- 缺少前置用户消息的历史内容仍保持可见。
- Pi 回复正文保持可见，执行区域与有正文的 thinking 提供收折入口。用户气泡省略可见角色名称，用户、回复与系统事件常显可选择的日期与时分秒文字；回复时间范围位于容器外部左下方，正文使用完整内容宽度。
- 压缩进行状态与完成摘要作为独立系统事件展示，保持原始顺序与工具结果关联。

## 工具状态与结果

工具通过 `toolCallId` 去重及关联结果。历史 `toolResult` 优先提供最终内容，其次使用实时结束事件；部分结果使用最新快照。

当前页面实时接收到的工具调用在执行事件到达前显示准备中，运行状态来自真实执行事件。缺少结果和执行信息时静态显示结果不可用，明确的终止消息结束回复内未完成工具，实例空闲时结束运行指示。结果跨正文或用户消息返回时仍归属原工具。

消息时间来自已有消息或事件，工具耗时采用已有执行结果。流式内容更新保留首次事件时间。实例确认空闲且没有流式消息时，回复以已有开始与最后更新时间计算约耗时；只有单个有效时间或时间范围无法计算时省略耗时。耗时按时长使用毫秒、秒、分钟、小时或天，长时段保留最多两个单位并省略零值。

## 身份与阅读连续

流式增长、最终结果交接与历史追加保持已有内容身份。展开状态、已打开详情和阅读位置随用户选择保留，实例或 session 切换时重置相关状态。

位于底部时跟随新内容，浏览历史时保持阅读位置。折叠操作保持点击入口位置，用户继续滚动后恢复正常滚动管理。

## 源码入口

- `src/web/src/features/conversation/conversationData.ts`：原始历史、消息和工具事件的字段识别。
- `src/web/src/features/conversation/useConversation.ts`：历史、流式消息与实时工具状态。
- `src/web/src/features/conversation/useConversationDisplay.ts`：回复与执行区域的派生展示，以及工具结果关联与展示数据。
- `src/web/src/features/conversation/types.ts`：对话数据与展示类型。
- `src/web/src/features/conversation/Conversation.tsx`：回复与执行汇总组件，使用展示模型及所属范围的数据。
- `src/web/src/features/conversation/ToolCallCard.tsx` 与 `details/`：工具入口及各工具详情。
- `src/web/src/features/conversation/useSessionList.ts`：session 列表查询状态。
- `src/web/src/features/conversation/useConversationChrome.ts`：顶部栏、输入区与 Safe Area 的尺寸观察。
- `src/web/src/features/conversation/useScrollAnchor.ts`：分页与阅读位置管理。

页面方向见 [Web 设计指导](web-visual-redesign.md)。
