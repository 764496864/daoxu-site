# 道序科技官网 — Claude Code 项目指南

## 一、项目概况

道序科技（DaoXu Technology）官网，单HTML文件静态站，部署在Vercel。
- 仓库：https://github.com/764496864/daoxu-site
- 线上地址：https://daoxu-site.vercel.app
- 文件结构：index.html + robots.txt + sitemap.xml
- 技术栈：纯HTML/CSS/JS，无框架，单文件

## 二、品牌设计规范（必须严格遵守）

### 视觉基调
- **墨底金骨**：深色背景（#07070A）+ 金色点缀（#C4A265）
- **东方极简**：克制留白，少即是多，不堆砌元素
- **殿堂感**：每个区块像走进一个厅堂，有仪式感
- **宿命感**：描述感受，不贴标签

### CSS变量（已定义在:root中）
```css
--bg:#07070A;--bg2:#0D0D10;--bg3:#131316;
--tx:#F2EDE4;--tx2:#C8C0B4;--tx3:#8A8480;--tx4:#5A5652;--tx5:#3A3836;
--gd:#C4A265;--gd2:#A8884E;  /* 金色 */
--sf:'Noto Serif SC',serif;   /* 宋体，标题用 */
--ss:'Noto Sans SC',sans-serif; /* 黑体，正文用 */
```

### 字体规则
- 标题/品牌名/大字：Noto Serif SC（--sf），font-weight 600-900
- 正文/说明/按钮：Noto Sans SC（--ss），font-weight 200-400
- 英文标签：小写字母 + 宽letter-spacing（8-10px）
- 禁止使用：Inter, Roboto, Arial, 或任何通用无衬线

### 动效规则
- 入场动画：emerge（blur + translateY + opacity），配合stagger delay（.d1~.d5）
- 滚动触发：IntersectionObserver给.rv元素加.v类
- 缓动函数：cubic-bezier(.16,1,.3,1) 和 cubic-bezier(.33,.9,.4,1)
- hover：border-color渐变 + 微弱发光，不要scale或弹跳
- 整体节奏：慢、优雅、克制。不要快闪或花哨效果

### 装饰元素
区块之间用品牌装饰符号分隔（不是单调的hr线），已有的类型：
- `.orn-dots`：三点金珠（小·大·小）
- `.orn` + `.orn-seal`：品牌印章SVG（32x32，流墨笔画）
- `.orn` + `.orn-cloud`：东方云纹SVG（80x20）
- `.dv`：渐变细线（最基础的分隔，少用）
所有装饰opacity在0.12-0.25之间，hover微微提亮，不要抢眼

## 三、当前页面区块顺序

```
Hero（道序 + slogan）
  ↓ 三点金珠
共鸣区（你已经靠自己走出了一条路...）
  ↓ 印章装饰
介绍区（WHAT WE DO - 道序科技做什么）
  ↓ 渐变线
子枫/明一双卡片（WHO WE ARE）
邀请框（想和明一聊聊？）
  ↓ 云纹装饰
道序天成（PHILOSOPHY - 道序承创四字）
  ↓ 三点金珠
生态区（ECOSYSTEM - 思想共同体）
  ↓ 十字印章
产品五步（SERVICES - 启门→问道→构想→道承→同道会）
CTA（如果你心里也有那个声音...）
联系区（CONTACT - 微信/邮箱）
Footer
```

## 四、明一聊天入口（重要）

所有"体验明一""和明一对话"按钮统一调用 `toggleChat()` 打开右下角浮窗。
- 浮窗HTML/CSS/JS已在文件中（.chat-fab + .chat-panel + toggleChat函数）
- 龙虾（OpenClaw）未接入时显示"明一正在部署中"占位
- 龙虾接入后改 `MINGYI_CHAT` 变量即可自动切换为iframe
- **禁止用alert弹窗**，**禁止新标签页跳转**

## 五、响应式断点

```
PC: 默认（max-width > 1024px）
平板: @media(max-width:1024px)
手机: @media(max-width:768px) — 汉堡菜单、单列布局
小屏: @media(max-width:480px) — 进一步缩紧
```

### 关键注意事项
- 很多布局用了inline style的grid（历史原因），必须用class + !important覆盖
- 已有class：`.intro-grid`（介绍区两列）、`.twin-grid`（子枫/明一双卡片）
- `.cta` section的padding也是inline，需要class覆盖
- 手机端汉堡菜单：`.ham`按钮 + `.nr.open` + `.overlay`
- 音乐播放器和聊天浮窗在小屏幕不能互相遮挡

## 六、已知坑（踩过的，不要再踩）

1. **Cloudflare Email Protection**：Vercel走Cloudflare CDN，会把邮箱混淆、注入脚本、截断JS。每次改完检查：无`cdn-cgi`残留、`</html>`存在、JS完整
2. **inline style优先级**：大量区块用了inline style设置grid-template-columns和padding，CSS媒体查询不生效。解决：给元素加class，用!important覆盖
3. **汉堡菜单点击冲突**：手机端点导航链接后需要自动关闭菜单（toggleMenu）
4. **字体加载**：Google Fonts在国内可能慢，首屏用font-display:swap

## 七、联系方式（写在页面里的）

- 微信：CL13889506035
- 邮箱：764496864@qq.com

## 八、用户信息

用户叫子枫，是道序科技创始人。他的审美偏好：
- 喜欢高级感、有文化底蕴的设计
- 讨厌空洞、内容稀疏、"看起来像AI做的"
- 喜欢装饰性细节（印章、纹样、符号）填充视觉
- 要求PC和手机端都要好看，不能只顾一边
- 说话直接，不要废话解释，改就是了

## 九、操作规则

- 改文件前先完整读一遍目标文件
- 不要为了改几行就重写整个文件
- 每次改完用浏览器验证效果
- commit message用中文，简洁说明改了什么
- 改完如果需要push，先问用户确认

## 十、设计参考文件

仓库里有一个前端设计skill文件，做任何UI改动时必须先读：

- **ELITE-FRONTEND-UX.md** — 前端UI/UX设计规范（设计token、无障碍标准、落地页结构、反面教材、交付检查清单）

**本项目的设计方向：** Luxury/refined + Art deco/geometric 的交叉——东方殿堂感，深色背景+金色点缀，克制但有力量。对应skill里的"Luxury/refined"和"Art deco/geometric"方向。

做改动前先读这个文件，特别是Anti-Patterns和Pre-Delivery Checklist两节。

## 十一、智能体广场（Agent Square）

### 功能说明
- 全屏overlay展示14个智能体卡片，用户点击直接开始对话
- 入口：导航栏"智能体广场"、右卡"智能体广场"按钮、CTA区"智能体广场"、聊天浮窗内"探索全部14个智能体→"
- 每张卡片有独立头像（avatars/目录）、名字、一句话定位、描述、开始对话按钮

### 14个智能体ID
main / biz-doctor / startup-coach / content-ops / ip-builder / ai-advisor / prompt-engineer / knowledge-distiller / think-room / deep-analyst / concept-breaker / austrian-room / action-coach / lacan-analyst

### 技术实现
- `openSquare()` / `closeSquare()` 控制overlay显隐
- `startAgent(agentId, agentName)` 关闭广场→打开聊天→展开大窗口→调用selectAgent
- 卡片头像存在 `avatars/` 目录，文件名与agentId对应（main→mingyi.png）

## 十二、WebSocket聊天系统

### 架构
- `MINGYI_CHAT` 全局变量存储后端地址（Cloudflare Tunnel / 正式域名）
- `selectAgent(agentId, agentName)` 构建聊天UI + 插入欢迎消息 + 调用connectWS
- `connectWS(agentId, vid)` 建立WebSocket连接，处理协议握手、历史消息、流式回复
- `sendMsg()` 发送用户消息 + 显示typing提示
- 每个访客有唯一ID（`daoxu_vid` in localStorage），session隔离

### 消息渲染
- `mdToHtml()` 处理聊天消息的markdown（粗体/斜体/列表）
- 流式回复用streamText变量累积，防止重复
- 时间戳在气泡内部右下角
- 气泡支持`white-space:pre-line`换行

### 关键约束
- **不要修改WebSocket协议逻辑**（connect.challenge→connect→hello-ok→chat.history→chat.send）
- **不要修改MINGYI_CHAT变量的拼接规则**
- **聊天浮窗有展开/收起模式**（toggleExpand函数）

## 十三、明一今日思考（Thought / Daily Insight）

### 数据流
- 后端"龙虾"每天自动生成thought.json并push到GitHub
- 前端`loadThought()`在页面加载时fetch thought.json（带时间戳防缓存）
- 卡片显示：date + title + summary
- 展开面板显示：summary导语 + sections（每个有heading + content）

### thought.json固定格式
```json
{
  "date": "2026-04-01",
  "title": "标题",
  "summary": "摘要（不超过100字，两句话之间用\\n分行）",
  "sections": [
    {"heading": "板块标题", "content": "正文。### 子标题用于折叠。**粗体**和`代码`前端自动渲染。"}
  ]
}
```

### 折叠逻辑
- "今天的世界"和"明一的思考"：首段展示 + "展开全文"按钮
- 其他板块（AI前沿等）：每个`### `子标题独立折叠，右侧"展开▾"按钮

### 关键约束
- **前端不commit thought.json**，这个文件由龙虾管理
- 龙虾推送后通过Vercel Deploy Hook触发部署

## 十四、文件结构

```
index.html          — 主页（唯一HTML文件，含CSS+JS）
thought.json        — 每日洞察数据（龙虾推送，前端不碰）
logo.png            — 品牌logo（透明底PNG）
bgm.m4a             — 背景音乐
avatars/             — 14个智能体头像
  mingyi.png
  biz-doctor.png
  startup-coach.png
  content-ops.png
  ip-builder.png
  ai-advisor.png
  prompt-engineer.png
  knowledge-distiller.png
  think-room.png
  deep-analyst.png
  concept-breaker.png
  austrian-room.png
  action-coach.png
  lacan-analyst.png
robots.txt
sitemap.xml
```

## 十五、已知技术债

1. 大量inline style（历史原因），需要用class+!important覆盖
2. 单HTML文件已超1000行，未来可考虑拆分CSS/JS
3. WebSocket无自动重连机制
4. 智能体广场卡片数据硬编码在HTML里，未来可改为JSON配置

