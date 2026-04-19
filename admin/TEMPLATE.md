# 道序后台 · 使用说明 & 内容模板

> 后台地址：https://daoxu.com.cn/admin/ （线上） · http://127.0.0.1:8765/admin/ （本地）
> 最近更新：2026-04-19（v2.3 UX 大改版）

## 🆕 v2.3 新增（2026-04-19）

1. **字段名全部中文化**——不用再看 `challenge / approach / result`，直接是"挑战 / 思路 / 成果数据"
2. **数组项默认折叠**——像手风琴，点一下才展开。5 条案例不再撑满屏幕
3. **标签（tags）紧凑显示**——不再每个标签占一大块，改成一行小 chip
4. **顶部"展开全部 / 折叠全部"按钮**——一键操作
5. **技术字段只读**——`id`（智能体 ID）自动变灰不可改，防止改坏路由

## 📖 快速上手（3 分钟版）

1. 打开后台，输入 GitHub token 登录
2. 顶部 tab 选要改的文件（比如"案例库"）
3. **默认只看到标题列表**（比如 12 条案例 → 12 行紧凑摘要）
4. **点要改的那一条**——展开，看到完整字段
5. 改完字 → 点右下角"保存到线上" → 60 秒后 daoxu.com.cn 生效

**关键**：不用"展开全部"——**按需展开**才不会被字段淹没。

---

## 🔑 第一次使用（5 分钟）

### 1. 拿到 GitHub Token

打开 https://github.com/settings/personal-access-tokens/new

填：
- **Token name**：`daoxu-admin`（随便填）
- **Expiration**：建议 90 天（到期会提醒重新生成）
- **Repository access**：Only select repositories → `764496864/daoxu-site`
- **Permissions → Repository permissions → Contents**：**Read and write**

点 Generate token → 复制那一串 `github_pat_...` 开头的文本

### 2. 登录后台

浏览器打开 **https://daoxu.com.cn/admin/**

- 粘贴 token 到输入框
- 点"进入后台"
- 验证通过后自动进入编辑界面
- Token 会存在你浏览器里（localStorage），下次打开自动登录

### 3. Token 存档

**重要**：把这个 token 保存到你的 Obsidian 里（不要记进脑子）：
- 路径：`D:\Obsidian-Vault\道序大脑\3_项目\官网\系统关键配置.md`
- 该文件在你本地 Obsidian，**不会**推到 GitHub

---

## ✍️ Markdown 格式（写内容时能用的标记）

任何字段（除了下拉选择和数字字段）都可以用这几个标记：

| 写这个 | 效果 | 例子 |
|--------|------|------|
| `**粗体**` | <strong>粗体</strong>（亮色） | 这是 `**重要**` 的 |
| `*斜体*` | <em style="color:#C4A265">金色强调</em>（不是真的斜体，是加金色） | 这是 `*你要记住的*` |
| `` `代码` `` | 等宽字体加虚下划线 | 微信号 `` `CL13889506035` `` |
| `[文字](/xx.html)` | 超链接 | `[关于页](/about.html)` |
| `\n` | 换行（在字段里直接按回车即可） | 第一行\n第二行 |

**不支持**：真正的 markdown 标题、列表、表格、图片。要那些效果得改 HTML（找新 Claude 改代码）。

**不懂 Markdown 也没关系**：所有字段直接当普通文字写也能保存。只是不会加粗 / 加金色。

---

## 📂 后台能改的 7 个文件

### 1. 全局 · 品牌联系（global.json）

**做什么**：改品牌名、微信号、邮箱、导航文字、footer 版权

**字段清单**：
- `brand.name` / `brand.nameEn` / `brand.slogan`
- `contact.wechat`（微信号）/ `contact.email`（邮箱）/ `contact.contactCta` / `contact.contactSubtitle`
- `nav.about` / `nav.services` / ...（导航栏 7 个链接的中文文字）
- `footer.copyright`
- `chat.fabLabel`（聊天球 tooltip）/ `chat.openingMessage`（默认欢迎语）

> ⚠️ **导航文字改了不会立即生效**——因为首页的导航 HTML 还没接通 JSON（下一轮开发）。当前改 `brand` / `contact` / `footer` 不会反映到页面。**此文件目前暂无前端接通**。

---

### 2. 首页（home.json）

**做什么**：改首页所有文案——Hero slogan、三板斧三张卡、案例预览、CTA

**字段清单**：
- `hero.tagline1/2/subtitle/ctaLabel`（首屏大标、副标、按钮）
- `whatWeDo.title/desc1/desc2/desc3/motto`（"道序科技"介绍卡）
- `threePillars.title/subtitle`（三板斧板块）
- `threePillars.pillars[0..2].name/tagline/desc`（三板斧每张卡）
- `casesPreview.cards[0..2]`（首页 3 张案例预览卡）
- `finalThreshold.line1/line2/quote1/quote2`（底部 CTA 文案）

> ⚠️ **此文件目前暂无前端接通**，改完保存 JSON 会更新，但 index.html 还不读取它（下一轮开发）。

---

### 3. 关于（about.json）

**做什么**：改关于页全部内容——道序品牌定义、子枫时间线、明一介绍、生态地图、四字哲学

**字段清单**（最关键的几处）：
- `brandIntro.p1/p2`（"道序是什么"两段文字）
- `founder.lead`（子枫介绍开场段）
- `founder.timeline[]`（可增删履历条目，每条 year/role/desc）
- `founder.stats[]`（4 个数据块，可改数字和标签）
- `founder.tagline`（底部"不是导师..."那句）
- `mingyi.lead`（明一介绍段）
- `mingyi.powers[]`（4 个能力块）
- `mingyi.quote`（底部引言）
- `ecosystem.blocks[]`（产品/思想/伙伴三块）
- `philosophy.intro`（四字哲学说明）

> ⚠️ **此文件目前暂无前端接通**，关于页 HTML 还是硬编码（下一轮开发）。

---

### 4. 服务 · 五步（services.json）

**做什么**：改服务页五步服务的所有文案

**字段清单**：
- `hero.title/tagline`（服务页 Hero）
- `steps[]`（五步数组，**可增删**）
  - 每步：`num/name/en/tagline/tags/body/h4a/listA/h4b/listB/meta`
- `cta.title/subtitle/buttonLabel`

> ⚠️ **此文件目前暂无前端接通**。

---

### 5. 智能体矩阵（agents.json）

**做什么**：改 14 个智能体的名字、一句话定位、描述

**字段清单**：
- `hero.title/tagline`
- `featured`（明一主卡）：`name/line/desc`
- `agents[]`（13 专项智能体，**可增删**）
  - 每个：`id/name/avatar/line/desc`
- `cta.*`

> ⚠️ **此文件目前暂无前端接通**。
> ⚠️ **改智能体数量**还需要：① 首页 / about 里"14 个"这个数字要同步改 ② 后端 OpenClaw workspace 要对应新建 ③ agents.html JSON-LD 里的 ItemList 要同步

---

### 6. 案例库（cases.json）

**做什么**：改案例库所有文案——说明、筛选器、每个案例卡

**字段清单**：
- `hero.title/tagline`
- `disclaimer.p1/p2/p3`（顶部"说明"段）
- `filters[]`（筛选器 tab，改标签文字）
- `cases[]`（案例数组，**可任意增删**）
  - 每条：`tags/title/scale/challenge/approach/result`
  - `tags` 数组：可选值 `media` / `ai` / `biz`（对应筛选器）
- `cta.*`

> ⚠️ **此文件目前暂无前端接通**。

---

### 7. FAQ 常见问题（faq.json）✅ **已接通前端**

**做什么**：改 FAQ 问答 —— **此文件改了保存后 60 秒内 https://daoxu.com.cn/faq.html 会立即更新**

**字段清单**：
- `items[]`（可任意增删）
  - 每条：`q`（问题）/ `a`（答案，支持 Markdown）

---

## 🔄 保存后的链路

```
你点"保存到线上"
   ↓
浏览器调 GitHub API PUT /contents/content/xxx.json
   ↓
GitHub 创建新 commit
   ↓
Vercel 监听 commit 自动部署
   ↓
约 60 秒后 daoxu.com.cn 对应页面更新（**仅已接通前端的文件生效**）
```

**已接通**：`faq.json`
**未接通**（保存到 GitHub 但网页不变）：其他 6 个

---

## 🛠️ 下一轮开发要做的（给新 Claude 的任务）

1. **接通 home.json** → 改 index.html 让它 fetch 并渲染 hero / 三板斧 / 案例预览
2. **接通 about.json** → 改 about.html 动态渲染子枫时间线、明一描述、生态地图
3. **接通 services.json** → 改 services.html 动态渲染五步
4. **接通 agents.json** → 改 agents.html 动态渲染 14 个智能体
5. **接通 cases.json** → 改 cases.html 动态渲染案例列表（改数量也能生效）
6. **接通 global.json** → 改所有子页的 nav / footer 读 global

每接通一个文件，就有"实时改即时生效"的体验。

**指南**：
- 参考 `faq.html` 的做法（它已经在用 fetch + mdRender 动态渲染）
- `mdRender(s)` 函数（FAQ 里定义了，可以 copy 到其他页）：HTML 转义 + MD 标记转 HTML
- 各页面 HTML 里的硬编码内容可以保留作为 **fallback**（fetch 失败时降级显示）

---

## 🚨 常见问题

### Q：我改了一个字段，点保存，显示成功，但网页没变？

答：**只有 faq.json 接通了前端**。其他 6 个文件 MVP 阶段只能存 JSON，不会影响网页。下一轮开发接通后就会变。

### Q：后台加载失败 HTTP 404？

答：说明仓库里还没这个文件（比如 `content/global.json` 第一次用）。后台会**从本地 sandbox 加载默认数据**作为模板，你改完第一次保存就会 create 到仓库。

### Q：改了数组（比如加了一个 FAQ 题），保存失败？

答：**可能是没有可复制的模板项**。先确保数组里至少有一项，再点"+ 添加一项"（会复制最后一项当模板）。

### Q：Token 过期了怎么办？

答：
1. 去 https://github.com/settings/personal-access-tokens 看状态
2. 过期的话，Generate a new token（同样设置）
3. 更新 Obsidian 里的 `系统关键配置.md`
4. 清浏览器 localStorage（F12 → Application → Local Storage → 删除 `daoxu_admin_pat`）
5. 重新登录

### Q：意外删了不该删的项怎么办？

答：
1. 去仓库 commit 历史 https://github.com/764496864/daoxu-site/commits/main
2. 找到误操作前的版本，点击该 commit
3. 找到对应的 `content/xxx.json` 文件
4. 复制里面的内容
5. 回后台手动改回来 + 保存
6. 或者让会用 git 的朋友帮你 `git revert` 那次 commit

### Q：同时两个人都在后台改会冲突吗？

答：会。GitHub API 用 `sha` 做并发控制——如果 A 和 B 同时打开后台，A 先保存成功，B 保存时会 409 冲突。解决：B 刷新后台重新加载最新内容再改。

### Q：我能改 HTML 结构吗？

答：不能。后台只改文字内容。想改视觉布局（比如"加一个板块"、"调布局"、"换颜色"）需要找 Claude 改 HTML / CSS。

---

## 📝 后台安全 & 注意事项

1. **Token 权限最小化**：永远只给 Contents 读写，不要给 Repository 全部权限
2. **Token 定期更换**：建议每 90 天重新生成一个
3. **Token 泄露立刻撤销**：如果不小心发到别人、截图发出去了，去 GitHub settings 立刻 Revoke
4. **不要在公共电脑登录后台**：localStorage 会记住 token
5. **本地开发环境**（http://127.0.0.1:8765/admin/）和线上环境（daoxu.com.cn/admin/）都是同一个 GitHub 仓库，改完都会推到线上 — 所以别以为本地改着玩"不会影响线上"

---

## 🧑 什么情况找 Claude 帮忙？

找 Claude：
- 改 HTML 结构、新增板块、改视觉
- 接通 home/about/services/agents/cases/global 到前端
- 改设计风格（颜色、字体、间距）
- 后台加新功能（实时预览、图片上传等）
- Token 泄露 / 后台打不开 / 保存失败 / 视觉错乱

不用找 Claude（自己在后台改就行）：
- 改文字、加粗、加链接
- 增删 FAQ 题目
- 增删案例
- 改服务的 tagline / body
- 改子枫履历时间线
- 改智能体的一句话定位

---

*本文档可以在后台右上角"使用说明 ↗"里打开查看。有改动需求告诉 Claude 更新这个文件。*
