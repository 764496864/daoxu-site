# 道序科技官网 — 新 Claude 必读文档

> **接手任何官网相关任务的第一步：读完这个文件**。
> 然后才看代码。不读这个就直接动手 = 90% 概率重复 4.15 那次大故障的弯路。
>
> 最近一次更新：**2026-04-19（v2.6.8 · 账户系统全链路 + admin 后台 + A2 数据层上线）**
>
> **新增重要章节**：
> - 第十四章 **账户系统 V2**（daoxu-auth plugin 架构 + 全部 RPC + 前端 adapter）
> - 第十五章 **admin 后台**（两个页面 + 双密码锁 + 管理员白名单）
> - 第十六章 **A2 数据层**（chat_messages / user_stats / jsonl 自动落盘）
> - 第十七章 **龙虾工作流**（后端协作规范 + PASS/FAIL 硬纪律）

---

## 〇、为什么有这个文件

2026-04-15 出过一次大故障：聊天框断掉。先后三个 Claude 接手，**全部诊断方向错了**：
- 一个去研究装 frp + nginx 反代
- 一个建议改 NS 到 DNSPod
- 一个建议建腾讯云上自部署

**真实原因只有两个，加起来 5 行代码 + 2 步 DNS 操作就修好。**

根因是新 Claude 不知道这套架构怎么跑、把"现状"误当成"原始设计"、然后开始重新发明轮子。

这个文件的目的：让下一个新 Claude 在 5 分钟内看懂整套链路，避免重复踩坑。

---

## 一、一图看懂整个架构

```
                    ┌─────────────────────────────┐
                    │  用户浏览器（PC / 手机）      │
                    └──────────────┬──────────────┘
                                   │
                ┌──────────────────┼──────────────────┐
                │ 静态官网请求      │ 聊天 WebSocket    │
                ▼                  ▼                  │
        ┌───────────────┐  ┌──────────────────┐      │
        │ Cloudflare DNS│  │ Cloudflare DNS   │      │
        │  daoxu.com.cn │  │ chat.daoxu.com.cn│      │
        │  ─→ Vercel    │  │ ─→ CF Tunnel     │      │
        └───────┬───────┘  └────────┬─────────┘      │
                │                   │                │
                ▼                   ▼                │
        ┌───────────────┐  ┌──────────────────┐      │
        │ Vercel Edge   │  │ Cloudflare Edge  │      │
        │ (HTTPS auto)  │  │ Named Tunnel     │      │
        └───────┬───────┘  │ UUID 514e7bcf... │      │
                │          └────────┬─────────┘      │
                │                   │                │
                │                   ▼                │
                │          ┌──────────────────┐      │
                │          │ WSL Ubuntu       │      │
                │          │ cloudflared      │      │
                │          │ (--protocol http2)│     │
                │          └────────┬─────────┘      │
                │                   │                │
                │                   ▼                │
                │          ┌──────────────────┐      │
                │          │ OpenClaw Gateway │      │
                │          │ 127.0.0.1:18789  │      │
                │          │ + 14 个智能体     │      │
                │          └──────────────────┘      │
                │                                    │
                ▼                                    │
        ┌───────────────────────────────────────────┘
        │ 静态文件来源
        ▼
┌──────────────────────────┐         ┌──────────────────┐
│ GitHub 仓库              │ ←─push──│ 本地代码          │
│ 764496864/daoxu-site     │         │ - WSL ~/daoxu-site│
│ branch: main             │         │ - Win C:\...code │
└──────────┬───────────────┘         └──────────────────┘
           │ webhook
           ▼
   Vercel 自动部署
   （30 秒完成）
```

**腾讯云 111.231.4.219**：早期架构残留，**当前只跑 baobao**（一个独立的反代应用）。**官网和聊天都不经过它**。每次新 Claude 看到它就想用，请忍住。它现在的角色是一个备用机，不动。

---

## 二、技术栈（一句话版）

| 层 | 用了什么 |
|----|---------|
| 静态站点 | 单文件 `index.html`（HTML/CSS/JS，无框架） |
| 部署 | Vercel（免费版，自动 HTTPS） |
| 代码托管 | GitHub `764496864/daoxu-site`，分支 `main` |
| DNS | Cloudflare（NS：`anton.ns.cloudflare.com / cruz.ns.cloudflare.com`） |
| 主域名 | `daoxu.com.cn`（裸） + `www.daoxu.com.cn` 都走 Vercel |
| 聊天通道 | `chat.daoxu.com.cn` → Cloudflare Named Tunnel → WSL OpenClaw |
| AI 后端 | 本地 WSL 跑 OpenClaw Gateway 2026.4+，14 个智能体 |
| 域名注册 | 腾讯云（DNSPod 是注册商默认 DNS，**不用**） |

---

## 三、🔥 推送 / 自动更新工作流（最常用）

**修改 `index.html` 后想让线上更新，标准操作只有 3 行：**

```bash
cd ~/daoxu-site                 # 或 C:\Users\76449\Desktop\code
git add index.html
git commit -m "<改了什么>"
git push origin main
```

**push 之后会自动发生：**

1. GitHub 收到 commit
2. GitHub 触发 Vercel 的 webhook
3. Vercel 拉代码 + 构建（纯静态，几秒钟）
4. Vercel 把新版本推到全球 edge
5. Cloudflare DNS 已经把 `daoxu.com.cn` CNAME 到 Vercel
6. **30~60 秒后**，用户强刷（`Ctrl+Shift+R`）就能看到

**不需要做的事：**
- ❌ 不需要 SSH 上腾讯云
- ❌ 不需要 rsync / scp
- ❌ 不需要重启任何服务
- ❌ 不需要清 CDN 缓存（Vercel 自动处理）
- ❌ 不需要在 Vercel 控制台点任何按钮

**何时验证：**
等 1 分钟，浏览器开 `https://daoxu.com.cn` + `Ctrl+Shift+R`。看到新版即成功。

**分支铁律：**
只用 `main` 分支。**不要建其他分支推送**——Vercel 默认只部署 main。

**应急方案（webhook 假死时）：**
Vercel Deploy Hook URL 存在用户本地 Obsidian：
- 绝对路径：`C:\Users\Administrator\Documents\Obsidian Vault\明一\06-每日情报\系统关键配置.md`
- **不在本项目仓库内**——Claude 看不到，需要让子枫自己查那个文件并提供 URL
- 找到 URL 后：`curl -X POST <URL>` 强制触发一次部署
- URL 格式示例：`https://api.vercel.com/v1/integrations/deploy/prj_xxxxx`（出于安全不存仓库）

---

## 四、🔥 DNS 链路（理解这个才能不被带偏）

### 4.1 域名注册 vs DNS 管家 — 两个东西

| 概念 | 是哪个 | 在哪管 |
|------|--------|--------|
| 域名注册商 | 腾讯云 | https://console.cloud.tencent.com/domain |
| DNS 管家（NS） | **Cloudflare** | https://dash.cloudflare.com/ |
| ❌ DNSPod | **不用**（是腾讯云注册时的默认 DNS，但我们改成 Cloudflare 了） | — |

**铁律：DNS 记录在 Cloudflare 改，不在 DNSPod 改。**

如果将来发现 NS 变成 `*.dnspod.net`（不是 `*.ns.cloudflare.com`），说明被改坏了，按第八节"NS 还原"步骤恢复。

### 4.2 Cloudflare 上当前的 4 条 DNS 记录

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| CNAME | `@` (daoxu.com.cn) | `cname.vercel-dns.com` | Proxied 🟠 |
| CNAME | `www` | `cname.vercel-dns.com` | Proxied 🟠 |
| Tunnel | `chat` | (绑到 daoxu Tunnel) | Proxied 🟠 |
| A | `baobao` | `111.231.4.219` | DNS only ⚪ |

**注意 chat 那条**：Cloudflare 控制台显示为 "Tunnel" 类型，实际底层是 CNAME 到 `<UUID>.cfargotunnel.com`。这是 Cloudflare Zero Trust 的"Public Hostname"机制——**只在 NS 在 Cloudflare 时才生效**。

### 4.3 NS 改到 DNSPod 会发生什么（4.15 故障教训）

```
浏览器 → 查 chat.daoxu.com.cn
  → DNSPod（管家）返回 CNAME 到 cfargotunnel.com
  → 浏览器解析 cfargotunnel.com，拿到 Cloudflare edge IP
  → 浏览器 TLS 握手发送 SNI "chat.daoxu.com.cn"
  → Cloudflare edge：这个域名 NS 不在我这边，我不知道路由到哪个 Tunnel
  → 关闭连接 → ERR_CONNECTION_CLOSED
```

**这就是 4.15 当天聊天框断掉的真实原因。** 不是 frp、不是 nginx、不是腾讯云。修复就是把 NS 改回 Cloudflare。

---

## 五、🔥 聊天链路（WebSocket）

### 5.1 前端 → 后端 URL 拼接规则

文件位置：`index.html` 顶部 + `connectWS` 函数

```javascript
const MINGYI_CHAT = 'https://chat.daoxu.com.cn';

function connectWS(agentId, vid){
  if(ws) ws.close();
  var base = MINGYI_CHAT.replace('https://','wss://').replace('http://','ws://');
  var url = base + '/chat?session=agent:' + encodeURIComponent(agentId) + ':main';
  // ↑ 路径 /chat + query session=agent:<agentId>:main 是 OpenClaw 2026.4+ 强制要求
  ws = new WebSocket(url);
  // ...
}
```

**铁律**：URL 必须长这样：
```
wss://chat.daoxu.com.cn/chat?session=agent:<agentId>:main
```

少了 `/chat?session=...` 路径 → 服务端不知道路由到哪个智能体 → 直接拒连。**4.15 当天前端 bug 就是这个**。

### 5.2 WebSocket 协议握手序列（不要改）

```
client → server:  连接建立
server → client:  connect.challenge
client → server:  connect (with answer)
server → client:  hello-ok
server → client:  chat.history (历史消息)
client → server:  chat.send (用户发的消息)
server → client:  chat.stream (流式回复)
server → client:  chat.done
```

具体在 `index.html` 的 `connectWS` 里 `ws.onmessage` 处理。**禁止改协议**。

### 5.3 后端链路

```
Cloudflare edge (sjc01/05/10/...)
  ↓ Cloudflare Tunnel（HTTP/2 模式，必须）
WSL cloudflared 进程（PID 不固定，看 /tmp/daoxu-named-tunnel.log）
  ↓ 转发到 http://localhost:18789
OpenClaw Gateway（自建，不要单独重启，见第七节）
  ↓ 路由到 14 个 workspace
明一 / 13 个专项智能体
```

---

## 六、启动龙虾（每次电脑重启后必做）

**唯一正确方式**：

```bash
bash ~/start-daoxu.sh
```

或者双击桌面 **「启动道序.bat」**（内部就是调上面这条命令）。

**脚本会跑 6 步**：
1. 检查 / 启动 OpenClaw gateway
2. socat 端口转发 18790 → 18789
3. 启动 Cloudflared Quick Tunnel（备用地址）
4. 启动 Cloudflared Named Tunnel `chat.daoxu.com.cn`（**必须 `--protocol http2`**）
5. 写入 `allowedOrigins` 到 `~/.openclaw/openclaw.json`，并重启 gateway
6. 输出确认信息

**铁律**：
- ❌ 不要单独 `openclaw gateway restart`（会让 Tunnel 脱钩）
- ❌ 不要直接 `cloudflared tunnel run`（少了 `--protocol http2` 参数会被公司网络挡）
- ✅ 永远用 `bash ~/start-daoxu.sh`

**幂等性说明（重要）**：
- `start-daoxu.sh` **可以重复跑**，脚本内部会检测已运行的 gateway 并跳过重复启动
- 如果第一遍跑完链路还没通，**不需要先 kill 进程再跑第二遍**，直接再跑一次即可
- 除非日志明确显示某个进程 `failed to start` 或端口冲突，否则不要手动 `pkill cloudflared` / `pkill openclaw`——那会打断脚本的状态管理
- 特例：如果连跑 3 次都没通，再看 `ps aux | grep -E 'cloudflared|openclaw'` 手动排查僵尸进程

**日志位置**：
- Named Tunnel：`/tmp/daoxu-named-tunnel.log`
- Quick Tunnel：`/tmp/daoxu-quick-tunnel.log`
- Gateway：通过 systemd `journalctl --user -u openclaw-gateway -f`

---

## 七、🔥 故障排查清单（按症状对照）

### 症状 1：聊天框显示"连接失败，请稍后重试"

**按顺序排查**：

```bash
# 1. gateway 自己活着吗？
curl -s http://127.0.0.1:18789/health
# 期望：{"ok":true,"status":"live"}
# 如果失败：bash ~/start-daoxu.sh

# 2. Tunnel 连上 Cloudflare 了吗？
tail -30 /tmp/daoxu-named-tunnel.log
# 期望：看到 4 行 "Registered tunnel connection ... protocol=http2"
# 如果只有 ERR / failed：bash ~/start-daoxu.sh

# 3. NS 还在 Cloudflare 吗？
dig +short -t NS daoxu.com.cn @1.1.1.1
# 期望：anton.ns.cloudflare.com. cruz.ns.cloudflare.com.
# 如果是 dnspod：去腾讯云域名管理改回来（见第八节）

# 4. 前端 WebSocket URL 路径对吗？（仅在"最近改过 index.html"时跑）
# 如果你就是来修 bug 的，且刚刚没动前端代码，跳过这一步，直接看 1/2/3
grep 'chat?session' ~/daoxu-site/index.html
# 期望：能找到 '/chat?session=agent:'
# 如果找不到：bug 是 connectWS 路径丢了，按第五节模板修
```

如果以上 4 步全过，再考虑别的（极少发生）。

**顺序优先级**：没动代码就从 1/2/3 找问题；刚推过代码就先跑 4。

### 症状 2：官网打不开 / 旧版本

```bash
# 1. DNS 指对了吗？
dig +short www.daoxu.com.cn @1.1.1.1
# 期望：cname.vercel-dns.com. 然后是 Vercel 的 76.x.x.x

# 2. Vercel 部署成功了吗？
# 浏览器开 vercel.com → daoxu-site 项目 → Deployments，看最新 commit 是不是 Ready

# 3. 浏览器缓存？
# Ctrl+Shift+R 强刷，或开无痕窗口测
```

### 症状 3：thought.json（明一日报）没更新

```bash
# 1. 龙虾 cron 09:00 跑了吗？
# 看 v9 资料.md 第五节"明一每日情报系统"

# 2. GitHub 仓库的 thought.json 更新了吗？
# 浏览器：https://github.com/764496864/daoxu-site/blob/main/thought.json

# 3. Vercel 部署了吗？
# 看 vercel.com → Deployments

# 4. 应急：手动触发 Deploy Hook
# curl -X POST <Deploy Hook URL>
# URL 在 Obsidian/明一/06-每日情报/系统关键配置.md
```

---

## 八、🔥 NS 还原步骤（万一又被改回 DNSPod）

1. 浏览器打开 https://console.cloud.tencent.com/domain
2. 找 `daoxu.com.cn` → 点进去
3. 左侧 / 详情页找 **"DNS 服务器"** 或 **"修改 DNS 服务器"**（不是 DNS 解析记录）
4. 改成：
   ```
   anton.ns.cloudflare.com
   cruz.ns.cloudflare.com
   ```
5. 保存，等 10~60 分钟传播
6. 验证：`dig +short -t NS daoxu.com.cn @1.1.1.1`

**改 NS 之前必须先确认 Cloudflare 那边 zone 完整**：
- https://dash.cloudflare.com → 看 daoxu.com.cn 在不在
- DNS 记录 4 条（`@` `www` `chat` `baobao`）齐全
- 不齐就先在 Cloudflare 补齐再改 NS，否则切过去会有子域挂掉

---

## 九、🚫 不要做的事（全部是已经踩过的坑）

> **沙盒铁律提醒**：用户说"测试/优化/试试/看看效果/预览/实验"等词 → 先去 `C:\Users\76449\Desktop\code\sandbox\` 改，**不要改 `code/` 根目录**。完整规则和备份/回档流程见 `CLAUDE.md` 顶部"🔒 沙盒 + 备份工作流"一节。

### 9.1 架构层
- ❌ **不要装 frp / nginx 反代到聊天链路** — 4.15 一个 Claude 提议过，是把"绕路"误当成"修复"。Cloudflare Tunnel 已经在做这件事，不需要再加一层。
- ❌ **不要把 NS 改到 DNSPod** — 改了聊天就死。如果别人改了，按第八节还原。
- ❌ **不要把官网部署到腾讯云** — Vercel 已经自动跑了，多一份只会出现版本不一致。
- ❌ **不要新建 Git 分支推送** — Vercel 只看 main。

### 9.2 代码层
- ❌ **不要改 WebSocket URL 拼接规则** — 必须有 `/chat?session=agent:<agentId>:main`
- ❌ **不要改 `MINGYI_CHAT` 常量** — 是 `https://chat.daoxu.com.cn`
- ❌ **不要改 WebSocket 握手协议** — connect.challenge → connect → hello-ok → chat.history → chat.send
- ❌ **不要碰 @keyframes / transition / 缓动函数** — 设计师调好的
- ❌ **不要单独 `openclaw gateway restart`** — Tunnel 会脱钩，必须用 `start-daoxu.sh`
- ❌ **不要去掉 cloudflared 的 `--protocol http2` 参数** — 公司网络挡 QUIC

### 9.3 配置层
- ❌ **不要在 `~/.openclaw/openclaw.json` 顶层加 `allowInsecureAuth`** — 该字段在 `gateway.controlUi` 下面。错位会让 gateway 启动失败。
- ❌ **不要 commit `thought.json`** — 由龙虾 cron 自动管理
- ❌ **不要修改 `start-daoxu.sh` 第 96 行** — `--protocol http2` 写死了

---

## 十、关键账号与文件位置

### 10.1 账号
| 项目 | 信息 |
|------|------|
| GitHub | `764496864`（仓库 `daoxu-site`） |
| Vercel | 项目 `daoxu-site` |
| Cloudflare | 邮箱 `764496864@qq.com` |
| 腾讯云 | 同邮箱 |
| 域名 | `daoxu.com.cn`（腾讯云注册） |
| 子枫微信 | CL13889506035 |

### 10.2 关键文件
| 文件 | 位置 | 作用 |
|------|------|------|
| `index.html` | `~/daoxu-site/` 和 `C:\Users\76449\Desktop\code\` | 官网源码 |
| `thought.json` | 同上 | 明一日报数据（龙虾自动管理） |
| `CLAUDE.md` | `C:\Users\76449\Desktop\code\` | Claude Code 用的项目指南（更细的代码规范） |
| `start-daoxu.sh` | `~/start-daoxu.sh`（WSL） | 一键启动脚本 |
| `启动道序.bat` | Windows 桌面 | 双击调上面那个脚本 |
| `openclaw.json` | `~/.openclaw/`（WSL） | OpenClaw 主配置 |
| `config.yml` | `~/.cloudflared/`（WSL） | Named Tunnel 配置 |
| 资料.md | 本文件夹 | v9 总知识库（道序全栈，不只官网） |

---

## 十一、4.15 故障复盘（提醒下一个 Claude）

### 真相
聊天框断掉，加 UI 小 bug，**实际只需要 5 行代码 + 2 步 DNS 操作**：
1. 修 `connectWS` 函数 WebSocket URL 拼接（加上 `/chat?session=...`）
2. 把 NS 从 DNSPod 改回 Cloudflare（一次性，不再变）
3. 修音乐按钮遮挡发送键的 CSS（一条 `.chat-panel.show ~ #mp` 规则）

### 为什么搞了一整天
**3 个 Claude（包括我）连续误判**，原因都一样：

| 错误 | 教训 |
|------|------|
| 没读 v9 资料.md 就动手 | **第一步永远是读 v9 + 这个 README** |
| 看到 DNSPod 有记录就以为 NS 在 DNSPod | **用 `dig @1.1.1.1` 验证 NS，不要靠猜** |
| 看到腾讯云就想用 | **腾讯云目前只跑 baobao，官网/聊天都不经过它** |
| 提议装 frp/nginx | **架构问题不要用工程量解决，先找根因** |
| Python 脚本改 openclaw.json 加错位字段 | **改配置前先 cat 看完整结构，不要凭印象** |
| 反复 restart gateway | **永远用 `bash ~/start-daoxu.sh`，不要单独重启** |

### 故障排查的正确顺序
1. 读这个 README
2. 读 v9 `资料.md`
3. 跑第七节的 4 条诊断命令
4. 找到根因再动手
5. 改完更新这个 README 的"故障复盘"段

---

## 十二、commit 历史中重要里程碑

| commit | 时间 | 说明 |
|--------|------|------|
| `5765e2c` | 3.26 | 仓库建立 |
| `b89522a` | 4.14 | 明一日报更新 2026-04-14 |
| `517adc5` | 4.14 | 4.14 故障爆发，临时切 Quick Tunnel 应急 |
| `e90ccae` | 4.14 | 切回 Named Tunnel，但 NS 已被改 |
| `84f1b96` | 4.15 | 视觉质感升级 |
| `5e9df4c` | 4.15 | **修 WebSocket URL 路径**（聊天框关键修复） |
| `d325baa` | 4.15 | 修音乐按钮遮挡发送键 |

---

## 十三、本文件维护规则

每次重大操作后回来更新：
- 新增故障 → 加到第十一节
- 改了 DNS / Tunnel UUID / Vercel 配置 → 改第二节、第四节
- 改了 WebSocket 协议 / URL 格式 → 改第五节
- 加了新 README 应该提醒的事 → 加到第九节"不要做"列表
- 账户系统 / admin / 数据层架构改动 → 改第十四~十六节

---

## 十四、账户系统 V2（daoxu-auth plugin）

### 14.1 整体架构

```
┌─────────────────────────────────┐
│  前端（浏览器）                   │
│  daoxu.com.cn/login.html 等      │
│  通过 js/auth.js 封装             │
└───────────┬─────────────────────┘
            │ WebSocket (wss://chat.daoxu.com.cn/chat?session=agent:main:auth-rpc)
            ▼
┌─────────────────────────────────┐
│  Cloudflare Named Tunnel         │
│  (同聊天通道复用)                 │
└───────────┬─────────────────────┘
            │
            ▼
┌─────────────────────────────────┐
│  WSL Ubuntu                      │
│  OpenClaw Gateway :18789         │
│  └─ plugins/daoxu-auth 插件      │  ← 后端同事"龙虾"维护
└───────────┬─────────────────────┘
            │
            ▼
┌─────────────────────────────────┐
│  SQLite                          │
│  ~/.openclaw/state/auth.db       │
│  + 其他表见第十六节               │
└─────────────────────────────────┘
```

### 14.2 龙虾（后端同事）的 plugin 目录

**路径**：`/home/administratorzifeng/.openclaw/extensions/daoxu-auth/`

**关键文件**：
```
daoxu-auth/
├── index.js                  ← plugin 入口（方法注册 + hook）
├── lib/
│   ├── db.js                 ← schema + 迁移（幂等 ALTER）
│   ├── runtime.js            ← runtime 初始化（建 V2 三张表）
│   ├── chat-store.js         ← V2 数据层（chat_messages / user_stats / jsonl）
│   ├── hooks.js              ← A1 hook 注册（不可用，见 17.2）
│   └── methods/              ← 每个 daoxu.* method 一个文件
│       ├── user-register.js
│       ├── user-login.js
│       ├── user-me.js
│       ├── profile-update.js
│       ├── memory-set.js
│       ├── stats-me.js
│       ├── chat-flush.js
│       ├── chat-history-v2.js
│       ├── chat-sessions-list.js
│       ├── admin-users-list.js
│       ├── admin-user-get.js
│       ├── admin-user-update.js
│       ├── admin-user-reset-password.js
│       └── admin-user-delete.js
```

### 14.3 全部 RPC 方法清单（LIVE）

**用户类（未登录也能调的首批）**：
- `daoxu.user.register` — 注册账户
- `daoxu.user.login` — 登录（返回 sessionToken）
- `daoxu.user.logout` — 登出
- `daoxu.user.recover_questions` — 找回密码：取安全问题
- `daoxu.user.recover` — 找回密码：答题 + 重置

**登录后（需 sessionToken）**：
- `daoxu.user.me` — 拿自己的完整 user 对象
- `daoxu.profile.update` — 改昵称 / 职业 / 简介 / 偏好 / **email** / **phone**
- `daoxu.memory.set` — 写全局记忆数组（最多 50 条，每条 ≤ 300 字）
- `daoxu.stats.me` — 自己的对话统计
- `daoxu.chat.flush` — **A2 核心**：前端一轮对话结束后推 user+assistant 消息落盘
- `daoxu.chat.history_v2` — 读某个 sessionKey 的消息列表（替代老 chat.history）
- `daoxu.chat.sessions.list` — 列出自己的所有 session（一个 agent 一条）

**admin 类（需 system_role='admin'）**：
- `daoxu.admin.users.list` — 用户列表（支持 search/status/sortBy/offset/limit）
- `daoxu.admin.user.get` — 单用户完整档案
- `daoxu.admin.user.update` — 改任意用户的 profile / memories / disabled / email / phone
- `daoxu.admin.user.reset_password` — 生成 12 位临时密码（只返回一次）
- `daoxu.admin.user.delete` — 软删除 + 匿名化（不真删历史）

### 14.4 数据契约（响应结构）

**顶层 user 对象**（所有返回用户的接口统一）：

```json
{
  "userId": "UUID v4",
  "username": "子枫03",
  "nickname": "陈璐",
  "role": "admin",            ← 顶层：系统权限（admin / user）
  "disabled": false,
  "createdAt": "ISO-8601 UTC",
  "lastLoginAt": "ISO-8601 UTC",
  "conversationsTotal": 2,
  "tokensTotal": 27,
  "email": "zifeng@test.daoxu.com",
  "phone": "13800138000",
  "profile": {                 ← profile 层：用户可编辑的档案
    "role": "创始人",          ← profile.role 是职业/职位（别跟顶层 role 混）
    "bio": "...",
    "preferences": "..."
  },
  "globalMemories": ["记忆 1", "记忆 2"]
}
```

**⚠ 核心陷阱**：`user.role` 是系统权限 admin / user，`user.profile.role` 是用户填的职业（如"创始人"）。**两个字段名字一样但含义不同**，DB 里也分开（`users.system_role` 存权限，`users.role` 存职业）。前端 `_fromBackendUser` 有相应 adapter。

### 14.5 前端 `js/auth.js` 结构

- `var Mock = {...}` — localStorage 本地假后端（开发期用）
- `var Real = {...}` — 走 auth-rpc WebSocket 调 daoxu.* 方法
- `var Backend = (BACKEND_MODE === 'real') ? Real : Mock` — 开关
- `window.DaoxuAuth = Auth` — 公开 API

**公开 API**（页面调这些）：
```js
DaoxuAuth.register(payload)         DaoxuAuth.login(payload)
DaoxuAuth.logout()                  DaoxuAuth.refreshMe()
DaoxuAuth.updateProfile(profile)    DaoxuAuth.setMemories(arr)
DaoxuAuth.getStats()                DaoxuAuth.isLoggedIn() / isAdmin()
DaoxuAuth.getToken() / getCachedUser()
DaoxuAuth.chatFlush(batch)          ← A2：聊天每轮结束前端调
DaoxuAuth.getChatHistoryV2(params)  DaoxuAuth.getChatSessionsList(params)
DaoxuAuth.adminUsersList(params)    DaoxuAuth.adminUserGet(userId)
DaoxuAuth.adminUserUpdate(userId, patch)
DaoxuAuth.adminUserResetPassword(userId)
DaoxuAuth.adminUserDelete(userId)
```

---

## 十五、admin 后台

### 15.1 两个页面（顶部 tab 互相跳）

- `/admin/` — **内容管理**（编辑 index.html 用的 content/*.json，走 GitHub PAT）
- `/admin/users.html` — **用户管理**（LIVE 真数据，走 daoxu.admin.* RPC）

### 15.2 admin 身份识别

两条路（OR 关系）：

1. **顶层白名单**（龙虾后端 config）：
   - `/home/administratorzifeng/.openclaw/openclaw.json` 的 `pluginConfig.daoxu-auth.adminUserIds`
   - 启动时 daoxu-auth 把这些 userId 的 `users.system_role` 置为 `'admin'`
   - 当前白名单：`["9af175c9-79ca-4d36-8b54-fcb2dcc15568"]`（子枫）

2. **前端兜底白名单**（`admin/users.html` + `profile.html` 硬编码）：
   - `var ADMIN_FALLBACK_IDS = ['9af175c9-79ca-4d36-8b54-fcb2dcc15568']`
   - 龙虾后端 role 字段偶尔故障时仍能进。前端 UI 门槛而已，真实鉴权在后端 admin.* RPC 里

### 15.3 内容管理（`/admin/`）双密码锁

**登录方式**：GitHub Personal Access Token（PAT），只给 `764496864/daoxu-site` 仓库 `contents: read & write` 权限。

**本地密码锁**（v2.5.9 起）：
- 首次：输 PAT + 勾选"用本地密码锁住" + 设 6+ 位密码 + 确认
- 加密：PBKDF2(150k iterations) + AES-GCM 加密 PAT，密文存 `localStorage['daoxu_admin_pat_enc']`
- 之后：只输本地密码 → 解密 PAT → 登录
- 密码永不离开浏览器。忘密码可"重置本地数据"清空重新输 PAT

### 15.4 用户管理（`/admin/users.html`）

- 列表：搜索（用户名 / 昵称 / 邮箱 / 电话）+ 状态筛选（全部 / 活跃 / 停用 / 已注销）+ 排序（创建 / 最后登录 / tokens / 对话数）
- 编辑抽屉：改用户名 / 昵称 / 职业 / 简介 / 偏好 / 记忆 / 邮箱 / 电话 / 账户状态
- 密码重置：生成 12 位临时明文，**只显示一次**（+ 一键复制）
- 软删除：把 profile 字段清空、username 改为 `deleted_<id>`、nickname 改为"已注销用户"；**历史消息/stats/jsonl 保留**（不是 GDPR 擦除）

---

## 十六、A2 数据层（自动落盘）

### 16.1 为什么是 A2 不是 A1

A1 = 纯后端 plugin hook 监听。尝试过（`api.on('before_dispatch')` / `agent_end`）但 OpenClaw SDK 的 hook 注册始终报 `missing name` warning，实际未生效。**已彻底放弃 A1**。

A2 = 前端在 chat final 后**主动调 daoxu.chat.flush**把一轮 user+assistant 推给后端。由于前端能精确知道一轮对话的边界，不丢数据。

### 16.2 三张新表

```sql
-- 消息表（user/assistant 逐条落）
CREATE TABLE chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  agent_id TEXT,
  session_key TEXT NOT NULL,
  role TEXT NOT NULL,           -- 'user' | 'assistant'
  message_kind TEXT,            -- 'text' | ...
  content TEXT NOT NULL,        -- ⚠ 已剥离 [user_context] 块（前端 stripUserContext）
  tokens_in INTEGER,
  tokens_out INTEGER,
  run_id TEXT,                  -- 前端生成的一轮对话标识
  message_hash TEXT,            -- sha1(content+runId) 防重
  created_at TEXT NOT NULL
);

-- 用户统计
CREATE TABLE user_stats (
  user_id TEXT PRIMARY KEY,
  conversations_total INTEGER DEFAULT 0,  -- 每轮对话 +1
  tokens_total INTEGER DEFAULT 0,          -- in + out 累加
  last_session_at TEXT
);

-- 会话归档（Q2 预留，还没大量用）
CREATE TABLE user_session_archives (
  user_id TEXT, session_key TEXT, archived_at TEXT, ...
);
```

### 16.3 jsonl 双写

每轮 flush 除写 DB 外，还 append 到：
```
~/.openclaw/state/users/<user_id>/transcripts/<sha1(session_key)>.jsonl
```

每行一条 JSON（role / content / runId / tokens / createdAt）。用于：归档 / 可导出 / 将来向量化检索原料。

### 16.4 前端 A2 调用点

`index.html` 的 `sendMsg()` 流程：

1. 用户输入 → `startNewRun(text)` 生成 runId，记录 userText/userTs（**剥离 user_context**）
2. 发 `chat.send` 给 OpenClaw（message 体带 `[user_context]`，AI 能读；前端用原文）
3. AI 流式回复 → `chat` event `state='delta'` 累加 → `state='final'`
4. final 时调 `finalizeRunAndFlush(finalAssistantText)` → `DaoxuAuth.chatFlush({sessionToken, sessionKey, userId, messages:[user, assistant], ...})`
5. 后端写 chat_messages + 更新 user_stats + append jsonl

**未登录用户**：不走 chatFlush（静默跳过）。聊天体验不受影响，但不持久化。

---

## 十七、龙虾（后端同事）工作流

### 17.1 他是谁

龙虾 = 另一个 Claude 窗口，负责 daoxu-auth plugin 开发。他有自己的 WSL 终端权限（能 `openclaw gateway reload`）。子枫是**中间人**，在两个 Claude 之间传话。

### 17.2 协作硬纪律（v2.6.3 建立）

子枫对龙虾的**汇报要求**：**只接受 PASS 或 FAIL，不接受过程播报**。

**✅ PASS 格式（四段）**：
1. request 原样 JSON
2. response 原样 JSON
3. 对应 SQL 查询结果
4. 一句话结论

**❌ FAIL 格式**：
- 失败日志原样
- 卡点定位（哪个 hook / 哪个事件 / 哪段 SQL）
- 结论：**切方案 / 回滚到 commit xxx**
- 需要前端配合什么

**不接受的汇报**：
- "我正在做" / "没阻塞" / "马上就好"
- "我改了代码，就差 reload"（reload 他自己做）
- "下次给结果"

### 17.3 reload 是他自己的职责

龙虾改完 plugin 代码后必须自己 `openclaw gateway reload` 验证，不能拆给子枫做。

历史上多次出现"他改完代码等 reload → 线上全挂"的假 PASS，前端要硬催他**在同一轮里跑完 reload + PASS**。

### 17.4 admin 白名单新加 user_id

子枫注册新管理员账户后：
1. 登录，F12 跑 `DaoxuAuth.getCachedUser().userId` 拿 UUID
2. 发给龙虾，让他加到 `pluginConfig.daoxu-auth.adminUserIds`
3. 重启 gateway 生效
4. 新 admin 下次登录后 `users.system_role = 'admin'`

---

## 十八、版本演进里程碑

| 版本 | 时间 | 关键变化 |
|------|------|---------|
| v2.5.5 | 2026-04-19 | 账户系统首版上线，默认 real 模式 |
| v2.5.6 | 2026-04-19 | 手机多浏览器 text-size-adjust 根源修复 |
| v2.5.7 | 2026-04-19 | autoOpenAgentFromURL，握手 wsReady |
| v2.5.8 | 2026-04-19 | admin/users.html mock UI 骨架 |
| v2.5.9 | 2026-04-19 | admin 登录本地密码锁 PAT（PBKDF2+AES-GCM） |
| v2.6.0 | 2026-04-19 | A2 路线前端接入 chat.flush |
| v2.6.2 | 2026-04-19 | admin 切 LIVE 真数据 + [user_context] 剥离 |
| v2.6.3 | 2026-04-19 | admin refreshMe + ADMIN_FALLBACK_IDS 兜底 |
| v2.6.4 | 2026-04-19 | profile admin 入口 + 历史抽屉按 runId |
| v2.6.5 | 2026-04-19 | 聊天 header 工具栏紧凑化 + 手机只显图标 |
| v2.6.6 | 2026-04-19 | email / phone 字段全链路启用 |
| v2.6.7 | 2026-04-19 | admin.users.list 切真分页 search/status/sortBy |
| **v2.6.8** | **2026-04-19** | **历史抽屉升级为会话列表（sessions.list）** |

---

## 十九、给下一个接手 Claude 的话

**不要**：
- 重新发明 HANDOFF.md 之类的交班文档（Claude Code 自动压缩上下文，冗余）
- 改 `users.role` 字段（那是职业，admin 权限在 `users.system_role`）
- 在 profile 保存时写 `role: 'admin'`（会被误当职业字段覆盖，但 backend 拆分后应该不再出事）
- 在 `chat_messages` 存带 `[user_context]` 的内容（前端剥离了，后端不该看到）
- 重启 gateway 不走 `bash ~/start-daoxu.sh`

**要**：
- 任何推线上前走 CLAUDE.md 里的沙盒工作流
- 给龙虾传话时要求四段 PASS/FAIL 硬格式
- 新账户的 userId 记在一个地方（配置 + 用户备忘录），防止忘密码丢失身份
- 前端 adapter 层（`js/auth.js` 的 Mock/Real）保持兼容，新 RPC 先 Mock 再 Real

**版本号**：每次实质更新版本号 +0.1，标在文件顶部。
