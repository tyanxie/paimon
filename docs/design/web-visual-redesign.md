# Web 设计指导

## 目标

Paimon 为多台服务器上的 Pi 实例提供统一的对话界面。页面以对话阅读和日常操作为中心，保持清晰的内容层次、紧凑的控制区域和连续的使用体验。

参考 macOS Liquid Glass 的材质与层次。保留亮暗主题及 `mist`、`aurora`、`ember` 背景，颜色组变更需要用户确认。

## 布局与视觉

- 侧栏顶部集中品牌首页入口、Hub 连接说明、新建实例与设置，机器分组排列在顶部入口下方。
- 实例按 Edge 分组，机器标题提供展开与折叠入口，名称后用括号显示实例数量；展开选择持久保存，机器菜单提供复制名称。组内顺序随实例数据保持稳定。
- 实例条目以名称为主，模型名称与上下文用量横条使用同一文字区域；状态圆点与输入区保持一致。机器箭头与实例状态圆点的中心使用相同水平位置，分组标题与条目保持共同左右边界。当前实例持续显示中性选中背景，管理按钮在条目右侧垂直居中并拥有独立区域，桌面悬停、焦点或选中时显示，触摸设备持续可见。机器标题与实例条目各自使用完整的整行背景反馈，菜单按钮保持透明，通过图标颜色与局部键盘焦点表达操作状态。

- 顶部信息栏沿对话区域展开，实例信息与 session 操作共同展示；正文与输入区保持适合阅读的宽度。桌面顶部信息栏与侧栏顶部保持一致。
- 正文在顶部栏与输入区附近逐渐隐藏，边缘范围跟随控件高度变化，圆角两侧与底部安全区保持清晰。
- 玻璃材质集中用于导航、顶部栏和输入区。正文、代码与图表优先保证可读性，渐变背景保持可见。
- 中性色表达内容层次，强调色用于主要操作与重要状态；同类控件保持一致的反馈。
- 桌面保持紧凑，触摸设备提供充分操作范围，布局根据实际可用空间调整。
- 设置选项使用等宽分段，短标签保持单行完整显示。控件获得充分宽度，空间不足时标签与控件上下排列。

设置布局参考 Apple 官方 [Segmented controls](https://developer.apple.com/design/human-interface-guidelines/segmented-controls) 与 [Layout](https://developer.apple.com/design/human-interface-guidelines/layout)。

侧栏的两层分组、展开选择与持续选中反馈参考 Apple 官方 [Sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars)、[Outline views](https://developer.apple.com/design/human-interface-guidelines/outline-views) 与 [Lists and tables](https://developer.apple.com/design/human-interface-guidelines/lists-and-tables)。

## 圆角与形状

界面以较小圆角的矩形为主体，圆角按用途采用五个固定档位，统一通过 `src/web/src/index.css` 的主题变量管理。

- `inline`：输入工具栏文字按钮、行内代码和小型标记。
- `control`：普通按钮、图标按钮、字段、菜单与列表条目。
- `content`：代码、图表、工具结果、thinking 与内部内容容器。
- `surface`：用户消息、Pi 回复、执行汇总、系统事件、顶部栏与浮动菜单。
- `panel`：侧栏、输入区、设置面板、弹窗与手机 sheet 顶部。

用户消息与 Pi 回复的四个角采用同一档位，通过颜色、位置和内容布局区分身份。发送、停止与跳到底部按钮使用圆形，其他操作使用圆角矩形；状态圆点、背景颜色标记、进度条端点与 sheet 手势标记保持圆形。手机扩大操作区域时保持所属圆角档位，折叠状态也保持同一档位。

嵌套控件结合内边距选择配套档位，分段控件采用 `content` 外框与 `control` 选项。Mermaid 普通节点与标签读取共用圆角变量，图表源码指定的特殊形状和局部样式保持可用。

形状与层次参考 Apple 官方 [Get to know the new design system](https://developer.apple.com/videos/play/wwdc2025/356/)：信息密集的桌面控件采用圆角矩形，嵌套形状与内边距协调。项目视觉参数按自身阅读与操作场景定义，Community Figma 数据作为参考资料。

## 对话组织

用户消息独立展示，气泡省略可见角色名称。其后的 assistant 内容组成回复，系统事件独立展示并分隔前后的可见回复。连续 thinking 与工具调用进入执行汇总，正文与系统事件分隔执行区域，保持工具汇总 A → 正文 A → 工具汇总 B → 正文 B 的顺序。

Pi 回复正文保持可见，执行汇总和有正文的 thinking 提供展开入口，后续内容更新保留用户选择。展开箭头位于标题前方，通过固定缩进表达层级；工具详情入口位于条目末尾。空 thinking 省略条目。用户消息与系统事件常显可选择的日期与时分秒文字，回复的开始与最后更新时间位于容器外部左下方，确认空闲后按已有范围展示约耗时，单位随时长变化；正文使用完整内容宽度。

执行汇总以带淡背景的紧凑文字标记展示工具名称，按首次出现顺序合并同名工具，根据实际可用宽度展示完整名称，并为状态与剩余类型数量保留空间。状态图标、工具数量与 thinking 数量紧接展开箭头，工具名称标记排列在其后，整行提供展开入口。准备与执行中的工具分别统计，成功、失败、终止和不可用结果分别标识。Agent、执行汇总与工具条目各自表达所属范围的活动，可同时显示运行指示。工具条目与详情标题在开头固定展示状态图标和工具名称；条目末尾保留耗时与详情箭头。图标结合形状、颜色和可访问说明表达状态。

工具详情支持参数、部分输出、最终结果、错误与已有耗时。时间与状态使用真实数据，缺少结果和执行记录时静态显示结果不可用。

内容层次参考 Apple 官方 [Layout](https://developer.apple.com/design/human-interface-guidelines/layout)、[Progress indicators](https://developer.apple.com/design/human-interface-guidelines/progress-indicators)、[Icons](https://developer.apple.com/design/human-interface-guidelines/icons) 与 [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)：重要状态放在阅读顺序的前端，通过逐步展开控制信息量，同类状态保持固定位置，并提供形状与文字说明。

浏览历史时保持阅读位置，位于底部时跟随新内容。折叠、流式增长、历史追加和预览更新应保持阅读连续。数据规则见 [对话数据与展示原则](conversation-rendering.md)。

## 输入与操作

- 已有容器内的辅助按钮默认透明，交互时显示反馈；主要操作、选中状态与独立悬浮按钮按需保留背景。
- 键盘操作保留局部焦点提示，输入框获得焦点时显示输入区蓝色边框。鼠标与触摸调整输入区高度时保留原有焦点，拖动反馈随操作结束恢复。

- 输入区支持草稿、IME、图片、发送与停止，配置操作与任务控制分别分组。上下文用量位于发送与停止按钮附近，Agent 状态采用与侧栏一致的呼吸灯和文字。桌面将任务信息排列在右侧；窄屏将配置与任务控制分行，任务控制行左侧展示 Agent 状态，右侧保留上下文与发送、停止。
- 编辑空间随内容增长，并支持手动调整高度；视口变化与手机键盘出现时保留可用的编辑和阅读空间。
- 模型、思考等级与上下文来自实例数据，等待更新和不可用状态具有清晰说明。模型选择按钮与菜单条目根据模型 identifier 自动展示品牌图标，优先使用品牌提供的彩色版本；常用品牌随页面加载，其他模型按需加载完整匹配组件，无法识别或加载失败时使用 Cpu 图标。入口展示当前模型名称，思考入口保留“思考”提示与当前等级。
- 跳到底部采用输入区上方居中的圆形悬浮图标按钮，玻璃背景保持与正文的清晰区别，悬停提示和可访问说明表达操作用途；位于底部时隐藏，浏览历史时显示。
- 新建实例与压缩表单提供明确字段、错误反馈和持续可见的确认操作。底部同组操作保持相同高度，桌面采用紧凑尺寸，触摸设备保留充分操作范围，主要操作通过强调色表达。

按钮尺寸与操作层次参考 Apple 官方 [Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons) 与 [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)。

- Agent 状态常驻输入区任务控制区域，与侧栏统一使用空闲、执行中和压缩中。空闲使用静态绿色圆点，执行与压缩使用相应颜色的呼吸灯，实例信息缺失时静态显示状态等待更新。压缩进行状态与完成摘要独立展示在对话中，连接信息保留在导航区域。

## 弹层与动画

- 桌面详情居中展示，手机详情采用接近全屏的底部 sheet；正文独立滚动，保留内容选择和横向代码滚动。
- session 选择浮层设置独立高度上限，并根据可用视口收缩；标题与搜索保持可见，历史列表独立滚动。尺寸原则参考 Apple 官方 [Popovers](https://developer.apple.com/design/human-interface-guidelines/popovers)。
- 弹窗支持 Esc、焦点管理与关闭后恢复入口焦点。详情打开时聚焦标题，图片预览聚焦内容说明；键盘操作通过 Tab 进入控件并显示局部焦点提示。触摸设备打开新建实例表单时聚焦标题，工作目录输入由用户选择。手机关闭手势与正文滚动分别处理。
- 状态、折叠和弹层使用短暂、可中断的反馈，异步结果更新保留已打开内容与阅读位置。
- reduced motion 下保留完整操作与状态信息。
- 兼顾亮暗主题、窄屏、长文本、Safe Area 与不同输入方式。真实观感、手势和性能由用户检查。

## 源码入口

布局与控件查看 `src/web/src/components/`，视觉参数查看 `src/web/src/index.css`，输入高度逻辑查看 `InstanceView/useComposerHeight.ts`。图表方向见 [Mermaid 设计指导](mermaid-theme.md)。
