# 道序科技官网 — 新 Claude 必读文档

> **接手任何官网相关任务的第一步：读完这个文件**。
> 然后才读同目录 `资料.md`（v9 总知识库），最后才看代码。
> 不读这个就直接动手 = 90% 概率重复 4.15 那次大故障的弯路。
>
> 最近一次更新：2026-04-15（v9.1 故障复盘 + 链路澄清）
> 维护人：每次重大操作完都要回来更新这里

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
v9 文档第 5.2 节有 Vercel Deploy Hook URL，存在 `Obsidian/明一/06-每日情报/系统关键配置.md`。`curl -X POST <URL>` 强制触发部署。

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

# 4. 前端 WebSocket URL 路径对吗？
grep 'chat?session' ~/daoxu-site/index.html
# 期望：能找到 '/chat?session=agent:'
# 如果找不到：bug 是 connectWS 路径丢了，按第五节模板修
```

如果以上 4 步全过，再考虑别的（极少发生）。

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

**版本号**：每次实质更新版本号 +0.1，标在文件顶部。
