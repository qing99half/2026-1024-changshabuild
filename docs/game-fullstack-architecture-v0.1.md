---
title: Righty Tighty 99 游戏全栈逻辑结构与开发框架
status: reverse-documented
baseline: v0.1 / c4b9e6f
date: 2026-10-25
---

# Righty Tighty 99 游戏全栈逻辑结构与开发框架

> 本文从代码反向整理，作为理解 v0.1、定位改动和扩展功能的开发地图。标为「已实现」的内容对应 v0.1 标签；标为「工作区开发中」的桌面封装存在于 2026-10-25 的未提交文件；标为「规划」的服务端能力尚无代码。规则数值描述当前行为，不自动代表未来设计意图。

## 1. 范围与版本边界

| 范围 | 当前状态 | 证据 |
| --- | --- | --- |
| 浏览器游戏、Canvas 画面、规则、音频、存档 | 已实现，v0.1 | [index.html](../index.html)、[core.mjs](../src/core.mjs)、[main.mjs](../src/main.mjs)、[audio.mjs](../src/audio.mjs) |
| HTTP 静态文件服务与静态目录构建 | 已实现，v0.1 | [server.mjs](../server.mjs)、[build.mjs](../tools/build.mjs) |
| Windows Electron 便携封装 | 工作区开发中，未包含于 v0.1 标签 | [desktop/main.cjs](../desktop/main.cjs)、[desktop/assets.cjs](../desktop/assets.cjs)、[package.json](../package.json) |
| 账号、云存档、排行榜、业务 API、数据库 | 规划，尚未实现 | 本文第 12 节 |

这里的「全栈」指从输入、规则、画面、声音、持久化到交付入口的端到端链路。当前 HTTP 服务只读取本地静态文件，没有业务 API 或服务器存档。浏览器与桌面封装各自运行同一套游戏前端；桌面封装使用独立源，因此两者的 localStorage 数据不会自动同步。

## 2. 整体结构

~~~mermaid
flowchart LR
    User[键盘 / 鼠标 / 触屏] --> UI[main.mjs 输入和界面]
    UI --> Core[core.mjs 状态和规则]
    Core --> Queue[game.events 事件队列]
    Queue --> Visual[main.mjs Canvas 和特效]
    Queue --> Audio[audio.mjs 音效和音乐]
    Queue --> Save[localStorage 进度]
    UI --> Settings[localStorage 设置]
    Web[server.mjs 静态 HTTP] --> Page[index.html + src + assets]
    Desktop[Electron 自定义协议<br/>工作区开发中] --> Page
    Page --> UI
    Build[tools/build.mjs] --> Dist[dist 静态目录]
    Dist --> Desktop
~~~

### 2.1 模块职责与依赖

| 文件 | 负责 | 允许依赖 | 修改时特别注意 |
| --- | --- | --- | --- |
| [core.mjs](../src/core.mjs) | Game 对象、教程、移动、得分、碰撞、刷怪、死亡和结算 | skins、melody；无 DOM 和音频节点 | 保持规则可由 Node 测试直接调用 |
| [main.mjs](../src/main.mjs) | 浏览器入口、输入、固定步长调度、事件消费、Canvas、UI、设置、存档 | core、audio、skins、audio-policy | 同一文件同时管理界面与绘制，修改前追踪事件两端 |
| [skins.mjs](../src/skins.mjs) | 皮肤顺序、价格、局内倍率、资源和解锁条件 | 无 | 旧存档使用皮肤数字索引，已有条目不宜重排 |
| [melody.mjs](../src/melody.mjs) | 转向位置/方向对应音符和背景节拍对齐 | 无 | 音高表与音频样本命名需同步 |
| [audio-policy.mjs](../src/audio-policy.mjs) | 音量归一化和语音短句选择 | 无 | 50%–200%、1% 步进及五声音阶由测试约束 |
| [audio.mjs](../src/audio.mjs) | 资源解码、转向/特效/音乐总线、事件音效、隐藏球语音 | melody、skins、audio-policy、Web Audio | 浏览器需用户手势才能可靠启动音频 |
| [index.html](../index.html)、[style.css](../style.css) | 游戏容器、菜单、教程、暂停、结算、设置及布局 | main 中使用的元素 ID | 改 ID 时同步修改 main |
| [server.mjs](../server.mjs) | 开发用静态 HTTP 服务 | Node 标准库 | 不是业务后端；文件路径须受根目录限制 |
| [build.mjs](../tools/build.mjs) | 复制页面、样式、脚本、素材到 dist | Node 标准库 | 新顶层运行资源须加入复制清单 |
| [desktop/main.cjs](../desktop/main.cjs)、[desktop/assets.cjs](../desktop/assets.cjs) | 桌面窗口和 righty://game/ 资源响应 | Electron、dist；工作区开发中 | 不能当作 v0.1 已发布能力 |

**依赖方向约束：**规则层向外产生数据和事件；浏览器入口决定如何呈现、播放、保存。新增玩法应先在 core 定义状态转移，再在 main/audio 添加消费者，最后补规则测试。

## 3. 启动、游戏循环和状态机

### 3.1 启动顺序

1. 页面加载 [main.mjs](../src/main.mjs)；它预加载图片，并分别读取进度、动态效果、音效模式与三路音量。
2. [createGame](../src/core.mjs) 验证旧存档字段并创建初始 Game，状态为 menu。查询参数 mode=original 只切换敌人解锁门槛，不进入进度快照。
3. 入口同步菜单，预载音频，启动 requestAnimationFrame。
4. 点击开始后，如未完成教程则进入 tutorial，否则执行 startRound；同一局锁定 roundSkin。

### 3.2 固定步长

[main.mjs](../src/main.mjs) 将相邻动画帧耗时截到最多 0.08 秒，累积后每次以 [STEP = 1/60](../src/core.mjs) 调用 step，单帧最多运行 5 次；每次 step 后立即消费事件。渲染每个 requestAnimationFrame 执行一次。规则随机数使用 Game.seed 上的线性同余序列；视觉粒子和部分音效使用 Math.random，因此相同种子与输入只约束核心规则序列，不保证逐像素或逐声复现。

~~~mermaid
flowchart LR
    Frame[requestAnimationFrame] --> Elapsed[计算并限制 elapsed]
    Elapsed --> FX[更新视觉时钟]
    Elapsed --> Acc[累加器]
    Acc -->|每满 1/60 秒，最多 5 次| Step[core.step]
    Step --> Events[consumeEvents]
    Events --> Acc
    Acc --> Render[Canvas render]
    Render --> Frame
~~~

### 3.3 状态与转移

| 状态 | 进入方式 | 更新行为 | 离开方式 |
| --- | --- | --- | --- |
| menu | 初始或返回菜单 | 展示菜单，无局内规则推进 | 开始游戏/教程 |
| tutorial | 首次开始或练习操作 | 三段教学；失败只重试当前段，不结算点数 | 完成或跳过后进入 playing |
| playing | startRound、继续游戏 | 移动、拾取、敌人、奖励、碰撞、计时 | 暂停或死亡 |
| paused | 暂停按钮、Esc、窗口失焦/隐藏 | 局内规则停止；音乐暂停 | 继续或返回菜单 |
| dying | 撞墙或撞敌人 | 保留约 2 秒死亡动画窗口，随后结算 | results |
| results | finishRound | 显示得分、奖励和存档 | 再玩一次或返回菜单 |

状态主要在 core 内改变；返回菜单等 UI 操作在 main 内直接设置状态。因此新增状态时应同时检查 core.step、main.frame、syncUI、输入处理和音乐。

## 4. 领域状态与规则

### 4.1 Game 对象分组

| 数据组 | 代表字段 | 生命周期 |
| --- | --- | --- |
| 会话与事件 | status、seed、events、toast | 页面运行期间 |
| 本局表现 | score、stylePoints、grazeCombo、time、player、goal、point、enemies、bonuses、bombWaves、trail | 每局重置 |
| 节奏与生成 | spawnTimer、spawned、nextBonusAt、pointCount、nextTurnPointAt、introducedEnemies、nextEnemyId | 每局重置 |
| 时间效果 | freezeTimer、freezeFxTimer、slowPhase、timeScale、deathTimer | 每局重置 |
| 长期进度 | best、totalPoints、lifetimePoints、gamesPlayed、unlocked、selectedSkin、tutorialSeen、developerMode | snapshotProgress 保存 |
| 本局皮肤 | roundSkin | 开局从已拥有的 selectedSkin 固定，局中不随商店选择变化 |

状态由 [createGame](../src/core.mjs) 创建并按引用更新。世界坐标宽约 13.653、高 7.68；Canvas 固定为 960×540，main 将世界坐标转换为像素坐标。

### 4.2 核心规则入口

| 入口 | 关键转移 | 主要事件 |
| --- | --- | --- |
| turn(game) | 方向编号 0 上、1 右、2 下、3 左；顺/逆时针各转 90° | turn，携带位置、方向和音符标识 |
| step(game) | 60 Hz 推进玩家、目标、球、敌人、奖励、计时与碰撞 | pickup、deliver、bonus、freeze、bomb、near-miss 等 |
| checkGraze（core 内部） | 分段检查相对路径；合格擦肩离开安全带后清除敌人并得分 | near-miss、enemy-explode |
| spawnEnemy（core 内部） | 按分数门槛选敌人；第七次生成先替换为奖励，此后间隔变化 | 生成实体，无单独公共事件 |
| die / finishRound（core 内部） | dying 状态碎裂演出；倒计时结束后一次性入账 | die、results |
| selectSkin / buySkin | 商店选择、揭示、扣费和解锁 | unlock |

当前比赛门槛为 0、2、4、6、8、10、12 分；mode=original 对照门槛为 0、5、10、15、20、25、30 分。第七种白色双方块生成两个独立实体，各有 ID、移动和碰撞。普通光点需拾取并送回目标圈得 1 分；反转点送达后改变后续转向方向并触发慢动作。奖励球分别为加 2 分、冻结、炸弹。得分会重置体积，同时提高后续速度与成长率。以上为代码现状；调整节奏时应先明确设计目标，再改常量和测试。

## 5. 事件契约：规则与表现的边界

core 的 emit 将对象放入 game.events，基础字段为 kind、text，其他字段由事件提供。text 非空时同时创建短时 toast。main 的 consumeEvents 使用 splice(0) 清空队列，再按发生顺序播放音频、生成视觉效果，并在特定事件上保存进度。这是内存事件队列，不是网络消息队列，也没有跨页面持久化保证。

| 事件组 | 主要 kind | 常用附加字段 | 消费结果 |
| --- | --- | --- | --- |
| 操作与教学 | start、turn、tutorial-stage、tutorial-retry、tutorial-complete | turn 的 x/y、dir、toneId、toneBand；教学 stage | 转向环与声音、教程 UI、完成时保存 |
| 光点与得分 | point-spawn、pickup、deliver、deliver-turn、goal-burst、reverse | 位置、scoreDelta | 光点/得分表现、声音；反转方向已由 core 修改 |
| 敌人与奖励 | near-miss-enter、near-miss、enemy-explode、bonus、freeze、bomb | targetId、type、source、grade、styleDelta、scoreDelta | 擦肩/碎裂/奖励特效和音效 |
| 失败与结算 | die、results | die 的位置与敌人快照 | 玩家/敌人碎裂、音乐淡出、结算并保存 |
| 商店与开发模式 | unlock、developer-mode | 文本提示 | UI 与进度保存 |

**新增事件检查清单：**定义触发时机和字段 → 考虑教程/暂停/死亡状态 → 在 visualEvent 与 playAudioEvent 中接入 → 决定是否需要触发 save/syncUI → 添加规则测试。对已有 kind 改名需要同时检查 core、main、audio 和测试。

## 6. 画面、音频与输入

### 6.1 输入和 UI

空格、Enter、画布点击/触屏由 [main.mjs](../src/main.mjs) 转发给 turn 或开始/继续流程；Esc 处理暂停与设置返回。设置菜单覆盖在首页或暂停界面之上。窗口失焦或页面隐藏时，playing 自动暂停。index.html 中的元素 ID 是 main 的直接依赖，没有独立组件框架。

### 6.2 Canvas 表现

main 在固定 960×540 画布上绘制背景与分数、目标、敌人与预警、奖励、玩家、光点、粒子/环、HUD。视觉数组（particles、rings、scorePulses、labels 等）与 core 的 Game 分开维护；死亡事件携带敌人快照供碎裂动画使用。动态效果「减弱」减少常规粒子和震屏，但保留失败碎裂提示。

### 6.3 音频路径

~~~mermaid
flowchart LR
    Event[game.events] --> Route[playAudioEvent]
    Route --> Turn[转向总线]
    Route --> Effect[特效总线]
    Music[背景音乐 + 冻结滤波/淡出] --> MusicBus[音乐总线]
    Turn --> Output[AudioContext destination]
    Effect --> Output
    MusicBus --> Output
~~~

原版模式的转向使用 clip 94；扩展音律模式读取 melodic 中的定音短音。两款隐藏球语音仅在扩展模式、且至少两段语音加载成功时使用；音节选择在 G 小调五声音阶内，加载失败回退到普通效果。擦肩或炸弹清除敌人使用独立 eliminate.wav，短时间的多次消除合并播放。三个音量总线由设置独立控制，范围 50%–200%，步进 1%；原版背景音乐元素的基础音量仍为 0.4。

## 7. 存档与设置

| localStorage 键 | 内容 | 写入时机 |
| --- | --- | --- |
| righty-web-progress-v1 | best、totalPoints、lifetimePoints、gamesPlayed、developerMode、selectedSkin、unlocked、tutorialSeen | results、unlock、tutorial-complete、developer-mode；商店选择/购买也主动保存 |
| righty-reduced-motion | 动态效果是否减弱 | 切换按钮 |
| righty-audio-mode-v2 | original 或 extended | 切换按钮 |
| righty-volume-levels-v1 | turn、effects、music 的百分比 | 拖动对应滑块 |

[snapshotProgress](../src/core.mjs) 明确规定长期字段；局内位置、敌人、得分进行态和事件队列不写入存档。createGame 对皮肤索引、点数及旧存档做有限校验与兼容。存储不可用时以当前会话继续运行。localStorage 可被用户修改，因此它只适合作为本地进度；若未来引入公开排行榜或云经济，服务端需要重新定义可信数据与结算方式。

## 8. 资源、服务、构建与交付

| 层 | 当前做法 | 变更入口 |
| --- | --- | --- |
| 原版图像 | assets/original；来源及尺寸在 manifest.json | 素材替换时保留路径或同步 main 引用 |
| 皮肤 | assets/skins 与 skins.mjs | 保持已存档的索引稳定 |
| 音频 | assets/audio 的原版片段、melodic、guest 和 eliminate.wav | 修改映射时同步 audio.mjs 和相关测试 |
| 网页服务 | server.mjs 按 MIME 类型读取项目内文件，默认端口 4173 | 服务规则、缓存或部署入口 |
| 静态构建 | npm run build 将 index、style、src、assets 复制到 dist | tools/build.mjs |
| Windows 桌面 | 工作区开发中：Electron 读取 dist，以 righty://game/ 提供资源，包含字节范围响应 | desktop/main.cjs、desktop/assets.cjs、package.json |

网页版以 npm run dev 启动；npm test 使用 Node 内置测试运行器。构建脚本会重建 dist，dist 是被忽略的生成目录。当前仓库未见 CI 工作流或真实业务部署配置。桌面工作区新增 npm run desktop 与 npm run package:win，但它们不属于 v0.1 标签的已发布基线；便携包是否可交付应以该工作区单独构建和启动验证。

## 9. 测试映射与验收

| 变更类型 | 首要测试 | 额外验收 |
| --- | --- | --- |
| 移动、碰撞、擦肩、得分、敌人、道具、教程、存档 | [game.test.mjs](../test/game.test.mjs) | 实际游玩关键路径 |
| 转向音符、节拍、原版音效参数 | [melody.test.mjs](../test/melody.test.mjs) | 浏览器音频手势与听感 |
| 语音短句、音量范围、消除 WAV 格式 | [audio-policy.test.mjs](../test/audio-policy.test.mjs) | 设置滑块、试听和两种音效模式 |
| 桌面资源协议（工作区开发中） | [desktop.test.cjs](../test/desktop.test.cjs) | Electron 窗口、资源加载、便携包启动 |
| 页面/样式/素材路径 | npm run build、浏览器打开 | 横屏与桌面尺寸、控制台报错 |

文档验收以源文件和测试名称可定位、示例状态转移与事件字段一致、所有「已实现/开发中/规划」标签准确为准。文档改动本身不要求重新平衡数值。

## 10. 扩展开发流程

### 新增敌人

1. 在 core 的 ENEMY_TYPES、生成池和碰撞逻辑中定义形状、移动、门槛与判定。
2. 如需视觉差异，在 main 的素材表、预警、残影、绘制与碎裂颜色中接入；音效需求映射到 audio 事件。
3. 写生成门槛、独立实体、碰撞边界、离场或消除测试；检查教学和炸弹波及场景。

### 新增奖励或特殊球

1. 在 core 的实体状态、生成选择、拾取/送达效果中实现规则，并确定事件 kind、scoreDelta 和位置。
2. 在 main 接入提示、轨迹与触发动画；在 audio 接入原版与扩展模式的声音。
3. 验证冻结、死亡、暂停、连锁清除及结算入账时序。

### 新增皮肤或设置

皮肤在 skins.mjs 追加，并核对商店文字、贴图、视觉粒子、声音及旧索引兼容。设置在 main 定义读取/写入、UI 和生效接口；若改变规则参数，必须说明是立即生效还是下一局生效。新增持久化字段时同步 snapshotProgress、createGame 和旧存档测试。

### 交付前门槛

依次完成规则测试、静态构建、浏览器关键路径验收；若交付桌面版，再验证协议资源、音频字节范围、窗口启动与产物。提交流程应记录基线提交与标签，生成文件和原始素材应按仓库约定处理。

## 11. 当前约束与待确认问题

| 项目 | 现状与影响 | 后续验证 |
| --- | --- | --- |
| main.mjs 同时承载 UI、绘制和视觉事件 | 新增玩法可能需要跨多个长函数修改 | 达到维护瓶颈时按输入、绘制、视觉事件拆分，保持 core 契约 |
| 事件没有集中类型定义 | 字段改名依赖搜索与测试发现遗漏 | 后续可加入 JSDoc/类型检查及事件清单 |
| 只有 localStorage 存档 | 跨设备、账号恢复与防篡改均未实现 | 先确定是否需要云能力，再设计迁移 |
| 原作导出素材 | 本机复现已有来源记录，公开传播许可待确认 | 发布渠道和授权方案明确后审查素材 |
| 桌面封装未进入 v0.1 标签 | 当前工作区与封板版本的功能范围不同 | 单独完成打包验收后记录新基线 |
| 一些规则参数来自原版复现或后续反馈 | 代码能证明行为，不能单独证明设计动机 | 设计调整时记录目标、备选方案和验证结果 |

## 12. 规划：业务服务端边界

以下只描述未来扩展点，不表示现有项目已经有 API 或数据库。

| 潜在需求 | 客户端边界 | 服务端职责候选 |
| --- | --- | --- |
| 云存档 | 上传/拉取进度快照，处理版本迁移和冲突 | 身份、存储、版本号、幂等写入 |
| 排行榜 | 提交局记录和可复算的输入/种子 | 校验规则版本与成绩、去重、排行查询 |
| 账号和购买 | 皮肤展示与操作入口 | 可信余额、交易流水、解锁归属 |
| 游戏遥测 | 仅在明确告知并选择后发送必要事件 | 采集、聚合、保留与删除策略 |

建议先明确是否需要这些需求，再定义 API 与数据表。若排行榜必须防本地改分，客户端分数和 localStorage 不能直接作为可信成绩；可考虑提交输入序列、随机种子和规则版本，由服务端复算，或由服务器掌握会话并验证。若只是本地单机，当前静态架构更简单。具体端点、数据库、身份系统和部署方式均待产品目标确认后另写设计决策。

## 13. 决策摘要与维护规则

**已观察到的架构选择：**核心规则不依赖浏览器 API，浏览器入口消费事件并负责表现；静态资源由 Node 服务或构建目录交付。这样可以直接用 Node 测试玩法，也便于复用同一前端到桌面窗口。代价是 main 的职责较集中，事件与存档契约仍靠约定维持。

**文档维护规则：**修改规则、事件字段、存档格式、交付入口或功能状态时，同步更新本文件相应表格及证据链接。新增功能先写清「已实现、开发中、规划」状态；只有经过实现与验证后才提升状态。涉及设计意图的说明应引用用户决定或单独设计记录，避免由代码行为倒推动机。
