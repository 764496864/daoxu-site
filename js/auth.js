// 道序账户系统客户端 SDK
// 同一份接口，两种 backend 模式：
//   MOCK：localStorage 模拟（前端独立可跑，UI 预览用）
//   REAL：分两条链路 ——
//     · 鉴权 / 钱包 / 卡密：api.daoxu.com.cn REST（FastAPI，Bearer token，信封 {ok,data}）
//     · 聊天落盘 / admin RPC：龙虾 OpenClaw WebSocket（保持不变）
//
// 切换：URL 加 ?authMode=mock 或 localStorage.setItem('daoxu_auth_mode','mock')。默认 real。
//
// 调用方所有方法都返回 Promise<{ ok, data?, error? }>

(function(global){
'use strict';

// v2.6 迁移：鉴权后端从龙虾 WS 切到 api.daoxu.com.cn REST（全新账号体系，老龙虾账号不迁移）。
// 清掉旧的本地 token / 缓存用户 / mock 数据，强制用户在新后端重新注册登录。
(function migrateToRest(){
  try{
    if(localStorage.getItem('daoxu_auth_migrated_v26') !== '1'){
      ['daoxu_mock_users','daoxu_mock_sessions','daoxu_session_token','daoxu_current_user'].forEach(function(k){
        localStorage.removeItem(k);
      });
      if(localStorage.getItem('daoxu_auth_mode') === 'mock'){
        localStorage.removeItem('daoxu_auth_mode');
      }
      localStorage.setItem('daoxu_auth_migrated_v26','1');
    }
  }catch(e){}
})();

var BACKEND_MODE = (function(){
  try{
    var qs = new URLSearchParams(location.search).get('authMode');
    if(qs === 'real' || qs === 'mock') return qs;
  }catch(e){}
  try{
    var saved = localStorage.getItem('daoxu_auth_mode');
    if(saved === 'real' || saved === 'mock') return saved;
  }catch(e){}
  return 'real'; // v2.6 起默认 real，鉴权走 api.daoxu.com.cn REST
})();

// ─────────────────────────── 后端地址 ───────────────────────────
// v2.6 迁移：鉴权类（register/login/logout/me/profile/memory/stats/recover）改走
// api.daoxu.com.cn 的 REST 后端（FastAPI，信封 {ok,data} / {ok,error}）。
// 聊天类（chat.flush / chat.history_v2 / chat.sessions.list）+ admin 类仍走龙虾 WS。
var API_BASE = 'https://api.daoxu.com.cn';

// 账户 RPC 独立 WS 连接（跟 index.html 聊天 WS 隔离，避免互相干扰）
// 接龙虾 daoxu-auth plugin（v2.5+）。session 用 'agent:main:auth-rpc' 凑合 OpenClaw 的 session param 校验。
// 仅聊天落盘（chat.flush/history_v2/sessions.list）+ admin RPC 还走它；鉴权已切 REST。
var REAL_WS_URL = 'wss://chat.daoxu.com.cn/chat?session=agent:main:auth-rpc';

var STORAGE = {
  USERS: 'daoxu_mock_users',         // mock 模式：所有用户表
  SESSIONS: 'daoxu_mock_sessions',   // mock 模式：所有 session token 表
  CURRENT_TOKEN: 'daoxu_session_token',  // 当前登录 token（mock + real 都用）
  CURRENT_USER: 'daoxu_current_user',    // 当前用户缓存（含 profile + memories）
};

// ─────────────────────────── 工具 ───────────────────────────

function sha256Hex(str){
  // Web Crypto SHA-256（Mock 模式专用，真后端用 bcrypt）
  var enc = new TextEncoder().encode(str);
  return crypto.subtle.digest('SHA-256', enc).then(function(buf){
    return Array.from(new Uint8Array(buf)).map(function(b){
      return b.toString(16).padStart(2,'0');
    }).join('');
  });
}

function genToken(){
  var arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(function(b){return b.toString(16).padStart(2,'0')}).join('');
}

function genUserId(){ return 'u_' + genToken().slice(0, 12); }

function nowISO(){ return new Date().toISOString(); }

function loadJSON(key, fallback){
  try{ return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
  catch(e){ return fallback; }
}

function saveJSON(key, val){ localStorage.setItem(key, JSON.stringify(val)); }

// ─────────────────────────── 校验 ───────────────────────────

function validateUsername(u){
  if(typeof u !== 'string') return 'INVALID_USERNAME';
  // 4-20 字符，unicode letter/number/_/-
  if(!/^[\p{L}\p{N}_\-.]{4,20}$/u.test(u)) return 'INVALID_USERNAME';
  return null;
}

function validatePassword(p){
  if(typeof p !== 'string' || p.length < 8 || p.length > 200) return 'WEAK_PASSWORD';
  return null;
}

function validateProfile(profile){
  if(!profile) return null;
  if(profile.nickname && profile.nickname.length > 60) return 'INVALID_REQUEST';
  if(profile.occupation && profile.occupation.length > 120) return 'INVALID_REQUEST';
  if(profile.detail && profile.detail.length > 4000) return 'INVALID_REQUEST';
  if(profile.preferences && profile.preferences.length > 2000) return 'INVALID_REQUEST';
  if(profile.globalMemories){
    if(!Array.isArray(profile.globalMemories) || profile.globalMemories.length > 50) return 'INVALID_REQUEST';
    for(var i=0;i<profile.globalMemories.length;i++){
      var m = profile.globalMemories[i];
      if(typeof m !== 'string' || m.length < 1 || m.length > 300) return 'INVALID_REQUEST';
    }
  }
  return null;
}

function validateSecurityQuestions(arr){
  if(!Array.isArray(arr) || arr.length !== 2) return 'INVALID_REQUEST';
  for(var i=0;i<2;i++){
    var q = arr[i];
    if(!q || typeof q.question !== 'string' || typeof q.answer !== 'string') return 'INVALID_REQUEST';
    if(q.question.length < 1 || q.question.length > 120) return 'INVALID_REQUEST';
    if(q.answer.length < 1 || q.answer.length > 200) return 'INVALID_REQUEST';
  }
  return null;
}

function err(code, message){ return { ok:false, error:{ code:code, message: message || code } }; }
function ok(data){ return { ok:true, data: data || {} }; }

// ─────────────────────────── MOCK 模式实现 ───────────────────────────

var Mock = {
  async register(p){
    var bad;
    if(bad = validateUsername(p.username)) return err(bad);
    if(bad = validatePassword(p.password)) return err(bad);
    if(bad = validateProfile(p.profile)) return err(bad);
    if(bad = validateSecurityQuestions(p.securityQuestions)) return err(bad);

    var users = loadJSON(STORAGE.USERS, {});
    if(users[p.username]) return err('USERNAME_TAKEN', '用户名已被注册');

    var passwordHash = await sha256Hex('mock_salt::' + p.password);
    var sqHashed = [];
    for(var i=0;i<p.securityQuestions.length;i++){
      var sq = p.securityQuestions[i];
      sqHashed.push({
        question: sq.question,
        answerHash: await sha256Hex('mock_salt::' + sq.answer.trim().toLowerCase())
      });
    }

    var userId = genUserId();
    var profile = Object.assign({
      nickname:'', occupation:'', detail:'', preferences:'', globalMemories:[]
    }, p.profile || {});
    var record = {
      userId: userId,
      username: p.username,
      passwordHash: passwordHash,
      profile: profile,
      securityQuestions: sqHashed,
      createdAt: nowISO(),
      updatedAt: nowISO(),
      lastLoginAt: nowISO(),
      disabled: false
    };
    users[p.username] = record;
    saveJSON(STORAGE.USERS, users);

    return Mock._issueSession(record);
  },

  async login(p){
    var bad;
    if(bad = validateUsername(p.username)) return err('USER_NOT_FOUND', '用户名或密码错误');
    if(typeof p.password !== 'string') return err('INVALID_REQUEST');

    var users = loadJSON(STORAGE.USERS, {});
    var u = users[p.username];
    if(!u) return err('USER_NOT_FOUND', '用户名或密码错误');
    if(u.disabled) return err('ACCOUNT_DISABLED', '账户已停用');

    var passwordHash = await sha256Hex('mock_salt::' + p.password);
    if(passwordHash !== u.passwordHash) return err('WRONG_PASSWORD', '用户名或密码错误');

    u.lastLoginAt = nowISO();
    users[p.username] = u;
    saveJSON(STORAGE.USERS, users);

    return Mock._issueSession(u);
  },

  async logout(p){
    var sessions = loadJSON(STORAGE.SESSIONS, {});
    if(p.sessionToken && sessions[p.sessionToken]){
      delete sessions[p.sessionToken];
      saveJSON(STORAGE.SESSIONS, sessions);
    }
    return ok({ ok:true });
  },

  async recover_questions(p){
    var bad;
    if(bad = validateUsername(p.username)) return err('USER_NOT_FOUND', '用户不存在');
    var users = loadJSON(STORAGE.USERS, {});
    var u = users[p.username];
    if(!u) return err('USER_NOT_FOUND', '用户不存在');
    return ok({ questions: u.securityQuestions.map(function(q){ return q.question }) });
  },

  async recover(p){
    var bad;
    if(bad = validateUsername(p.username)) return err('USER_NOT_FOUND');
    if(bad = validatePassword(p.newPassword)) return err(bad);
    if(bad = validateSecurityQuestions(p.securityAnswers)) return err(bad);

    var users = loadJSON(STORAGE.USERS, {});
    var u = users[p.username];
    if(!u) return err('USER_NOT_FOUND', '用户不存在');

    // 校验两道题的答案 hash
    for(var i=0;i<2;i++){
      var ans = p.securityAnswers[i];
      var saved = u.securityQuestions[i];
      if(!saved || saved.question !== ans.question) return err('WRONG_SECURITY_ANSWERS', '安全问题答案错误');
      var ansHash = await sha256Hex('mock_salt::' + ans.answer.trim().toLowerCase());
      if(ansHash !== saved.answerHash) return err('WRONG_SECURITY_ANSWERS', '安全问题答案错误');
    }

    u.passwordHash = await sha256Hex('mock_salt::' + p.newPassword);
    u.updatedAt = nowISO();
    users[p.username] = u;
    saveJSON(STORAGE.USERS, users);

    // 失效该用户所有 sessionToken
    var sessions = loadJSON(STORAGE.SESSIONS, {});
    Object.keys(sessions).forEach(function(t){
      if(sessions[t].userId === u.userId) delete sessions[t];
    });
    saveJSON(STORAGE.SESSIONS, sessions);

    return ok({ ok:true });
  },

  async me(p){
    if(!p.sessionToken) return err('UNAUTHORIZED');
    var sessions = loadJSON(STORAGE.SESSIONS, {});
    var s = sessions[p.sessionToken];
    if(!s) return err('TOKEN_EXPIRED', '登录已失效，请重新登录');
    if(new Date(s.expiresAt) < new Date()){
      delete sessions[p.sessionToken];
      saveJSON(STORAGE.SESSIONS, sessions);
      return err('TOKEN_EXPIRED', '登录已失效，请重新登录');
    }
    var users = loadJSON(STORAGE.USERS, {});
    // 通过 userId 找用户
    var u = null;
    Object.keys(users).forEach(function(name){
      if(users[name].userId === s.userId) u = users[name];
    });
    if(!u) return err('USER_NOT_FOUND');
    return ok({
      userId: u.userId,
      username: u.username,
      profile: Object.assign({}, u.profile, { globalMemories: u.profile.globalMemories || [] }),
      globalMemories: u.profile.globalMemories || []
    });
  },

  async profile_update(p){
    var sessions = loadJSON(STORAGE.SESSIONS, {});
    var s = sessions[p.sessionToken];
    if(!s) return err('TOKEN_EXPIRED');
    var bad = validateProfile(p.profile);
    if(bad) return err(bad);
    var users = loadJSON(STORAGE.USERS, {});
    var u = null, key = null;
    Object.keys(users).forEach(function(name){
      if(users[name].userId === s.userId){ u = users[name]; key = name; }
    });
    if(!u) return err('USER_NOT_FOUND');
    // 合并（保留旧的 globalMemories 如果新 profile 没传）
    var merged = Object.assign({}, u.profile, p.profile);
    if(p.profile.globalMemories === undefined) merged.globalMemories = u.profile.globalMemories || [];
    u.profile = merged;
    u.updatedAt = nowISO();
    users[key] = u;
    saveJSON(STORAGE.USERS, users);
    return ok({ ok:true, profile: merged });
  },

  async stats_me(p){
    // Mock 模式没有真实对话历史，返回 0；保留 lastSessionAt 给 session 的 last_seen_at
    var sessions = loadJSON(STORAGE.SESSIONS, {});
    var s = sessions[p.sessionToken];
    if(!s) return err('TOKEN_EXPIRED');
    return ok({
      conversationsTotal: 0,
      tokensTotal: 0,
      lastSessionAt: s.lastSeenAt || null
    });
  },

  // 钱包 / 卡密：Mock 模式给假数据，方便本地预览 UI（不接真后端）
  async wallet_balances(p){
    return ok({ balances: [
      { product:'digital_human', balanceCents: 0, frozenCents: 0 },
      { product:'strategist', balanceCents: 0, frozenCents: 0 }
    ] });
  },
  async redeem(p){
    return err('CODE_NOT_FOUND', 'Mock 模式无真实卡密，请切 Real 后端兑换');
  },

  async chat_flush(p){
    // Mock：空壳（前端独立开发期不对接后端）。返回 ok，不做任何落盘。
    return ok({ ok:true });
  },
  async chat_history_v2(p){ return ok({ sessionKey:p.sessionKey, total:0, offset:0, limit:p.limit||50, hasMore:false, messages:[] }) },
  async chat_sessions_list(p){ return ok({ total:0, offset:0, limit:p.limit||20, hasMore:false, sessions:[] }) },
  // Admin RPC 在 Mock 模式下不可用（admin/users.html 有自己的 mock 数据池，不会走到这里）
  async admin_users_list(p){ return err('NOT_SUPPORTED','Mock 模式无 admin RPC，请切 Real') },
  async admin_user_get(p){ return err('NOT_SUPPORTED','Mock 模式无 admin RPC') },
  async admin_user_update(p){ return err('NOT_SUPPORTED','Mock 模式无 admin RPC') },
  async admin_user_reset_password(p){ return err('NOT_SUPPORTED','Mock 模式无 admin RPC') },
  async admin_user_delete(p){ return err('NOT_SUPPORTED','Mock 模式无 admin RPC') },

  async memory_set(p){
    var sessions = loadJSON(STORAGE.SESSIONS, {});
    var s = sessions[p.sessionToken];
    if(!s) return err('TOKEN_EXPIRED');
    if(!Array.isArray(p.memories) || p.memories.length > 50) return err('INVALID_REQUEST');
    for(var i=0;i<p.memories.length;i++){
      if(typeof p.memories[i] !== 'string' || p.memories[i].length < 1 || p.memories[i].length > 300) return err('INVALID_REQUEST');
    }
    var users = loadJSON(STORAGE.USERS, {});
    var u = null, key = null;
    Object.keys(users).forEach(function(name){
      if(users[name].userId === s.userId){ u = users[name]; key = name; }
    });
    if(!u) return err('USER_NOT_FOUND');
    u.profile.globalMemories = p.memories.slice();
    u.updatedAt = nowISO();
    users[key] = u;
    saveJSON(STORAGE.USERS, users);
    return ok({ ok:true, memories: p.memories.slice() });
  },

  async _issueSession(userRecord){
    var token = genToken();
    var session = {
      sessionToken: token,
      userId: userRecord.userId,
      username: userRecord.username,
      createdAt: nowISO(),
      expiresAt: new Date(Date.now() + 30*86400*1000).toISOString(),
      lastSeenAt: nowISO()
    };
    var sessions = loadJSON(STORAGE.SESSIONS, {});
    sessions[token] = session;
    saveJSON(STORAGE.SESSIONS, sessions);
    return ok({
      userId: userRecord.userId,
      username: userRecord.username,
      sessionToken: token,
      profile: Object.assign({}, userRecord.profile, { globalMemories: userRecord.profile.globalMemories || [] })
    });
  }
};

// ─────────────────────────── REAL 模式实现（接龙虾 daoxu-auth plugin） ───────────────────────────
// 路线 Z / Plugin V1 契约：method 名加 daoxu.* 前缀 + 字段名适配（前端用 occupation/detail/globalMemories，
// 后端用 role/bio + 独立 memory.set）。adapter 层让前端 UI 代码一个字不用改。

var Real = {
  _ws: null,
  _ready: false,          // 完成 connect.challenge → connect → hello-ok 握手
  _connecting: false,
  _connectWaiters: [],
  _pending: {},
  _nextId: 1,

  _ensureWs(){
    return new Promise(function(resolve, reject){
      if(Real._ws && Real._ready) return resolve(Real._ws);
      Real._connectWaiters.push({ resolve: resolve, reject: reject });
      if(Real._connecting) return;
      Real._connecting = true;

      var ws = new WebSocket(REAL_WS_URL);
      var timer = setTimeout(function(){
        Real._connecting = false; Real._ws = null; Real._ready = false;
        var e = new Error('WS connect timeout');
        Real._connectWaiters.forEach(function(w){ w.reject(e) });
        Real._connectWaiters = [];
        try{ ws.close() }catch(_e){}
      }, 10000);

      ws.onopen = function(){ /* 等 connect.challenge */ };

      ws.onmessage = function(e){
        var d; try{ d = JSON.parse(e.data) }catch(_e){ return }

        // Step 1: 收到 connect.challenge → 发 connect
        if(d.type === 'event' && d.event === 'connect.challenge'){
          ws.send(JSON.stringify({
            type:'req', id:'c1', method:'connect',
            params:{
              minProtocol:3, maxProtocol:3,
              client:{id:'openclaw-control-ui',version:'control-ui',platform:'web',mode:'webchat'},
              role:'operator',
              scopes:['operator.admin','operator.read','operator.write','operator.approvals','operator.pairing'],
              caps:['tool-events'], auth:{},
              userAgent: navigator.userAgent, locale:'zh-CN'
            }
          }));
          return;
        }

        // Step 2: 收到 hello-ok → 握手完成，可以发 method
        if(d.type === 'res' && d.ok && d.payload && d.payload.type === 'hello-ok'){
          clearTimeout(timer);
          Real._ws = ws; Real._ready = true; Real._connecting = false;
          Real._connectWaiters.forEach(function(w){ w.resolve(ws) });
          Real._connectWaiters = [];
          return;
        }

        // Step 3: method 响应 → 路由到等待 resolver
        if(d.type === 'res' && d.id && Real._pending[d.id]){
          var pp = Real._pending[d.id]; delete Real._pending[d.id];
          if(d.ok) pp.resolve(ok(d.payload || d.result));
          else pp.resolve(err((d.error && d.error.code) || 'UNKNOWN', d.error && d.error.message));
        }
      };

      ws.onerror = function(e){
        clearTimeout(timer);
        Real._connecting = false; Real._ws = null; Real._ready = false;
        Real._connectWaiters.forEach(function(w){ w.reject(e) });
        Real._connectWaiters = [];
      };

      ws.onclose = function(){
        Real._ws = null; Real._ready = false;
        // 清理所有悬挂 pending 请求
        Object.keys(Real._pending).forEach(function(id){
          try{ Real._pending[id].resolve(err('CONNECTION_LOST','连接已断开')) }catch(_e){}
          delete Real._pending[id];
        });
      };
    });
  },

  async _call(method, params){
    try{
      var ws = await Real._ensureWs();
      var id = 'a' + (Real._nextId++);
      return new Promise(function(resolve){
        Real._pending[id] = { resolve: resolve };
        ws.send(JSON.stringify({ type:'req', id:id, method:method, params:params }));
        setTimeout(function(){
          if(Real._pending[id]){ delete Real._pending[id]; resolve(err('TIMEOUT', '请求超时')) }
        }, 15000);
      });
    }catch(e){
      return err('NETWORK_ERROR', String(e && e.message || e));
    }
  },

  // ─── REST helper（鉴权类方法用，走 api.daoxu.com.cn）───
  // path 形如 '/api/auth/login'；method 默认 POST。
  // token 非空时带 Authorization: Bearer（后端两种都兼容，Header 更标准）。
  // 统一返回前端用的信封 {ok,data}/{ok,error}（后端本就是这套信封，原样透传）。
  async _rest(path, opts){
    opts = opts || {};
    var method = opts.method || 'POST';
    var headers = { 'Accept': 'application/json' };
    var fetchOpts = { method: method, headers: headers, credentials: 'omit' };

    if(opts.token){
      headers['Authorization'] = 'Bearer ' + opts.token;
    }
    if(method !== 'GET' && opts.body !== undefined){
      headers['Content-Type'] = 'application/json';
      fetchOpts.body = JSON.stringify(opts.body || {});
    }

    var url = API_BASE + path;
    // GET：把 query 拼到 URL（后端 me/stats 用 query 收 sessionToken，也兼容 Bearer）
    if(method === 'GET' && opts.query){
      var qs = Object.keys(opts.query)
        .filter(function(k){ return opts.query[k] !== undefined && opts.query[k] !== null; })
        .map(function(k){ return encodeURIComponent(k) + '=' + encodeURIComponent(opts.query[k]); })
        .join('&');
      if(qs) url += (url.indexOf('?') >= 0 ? '&' : '?') + qs;
    }

    var resp;
    try{
      resp = await fetch(url, fetchOpts);
    }catch(e){
      return err('NETWORK_ERROR', '网络异常，请稍后再试');
    }

    var json;
    try{
      json = await resp.json();
    }catch(e){
      // 非 JSON（502/网关错误页等）
      return err('NETWORK_ERROR', '后端返回异常（HTTP ' + resp.status + '）');
    }

    // 后端契约：业务错误也用 HTTP 200 + ok:false，前端只看 body.ok。
    if(json && json.ok){
      return ok(json.data || {});
    }
    if(json && json.ok === false && json.error){
      return err(json.error.code || 'UNKNOWN', json.error.message || json.error.code);
    }
    // 兜底：HTTP 非 2xx 且 body 不符合信封
    if(!resp.ok){
      return err('HTTP_' + resp.status, '请求失败（HTTP ' + resp.status + '）');
    }
    return err('BAD_RESPONSE', '后端返回格式异常');
  },

  // ─── Adapter helpers ───
  // 前端 profile: {nickname, occupation, detail, preferences, globalMemories}
  // 后端 profile: {nickname?, role, bio, preferences}  + user.globalMemories 独立走 memory.set
  _toBackendProfile(fp){
    var out = {};
    if(!fp) return out;
    if(fp.nickname !== undefined) out.nickname = fp.nickname;
    if(fp.occupation !== undefined) out.role = fp.occupation;
    if(fp.detail !== undefined) out.bio = fp.detail;
    if(fp.preferences !== undefined) out.preferences = fp.preferences;
    if(fp.email !== undefined) out.email = fp.email;
    if(fp.phone !== undefined) out.phone = fp.phone;
    return out;
  },
  _fromBackendUser(bu, fallbackMems){
    // 后端 user.me 返回：{ user: {userId, username, nickname, role:'admin'|'user', disabled,
    //   email, phone, balanceCents, frozenCents, productBalances:[{product,balanceCents,frozenCents}],
    //   profile:{role,bio,preferences,email,phone}, globalMemories} }
    // 注意：顶层 role 是系统权限（admin/user），profile.role 是用户填的"职业/职位"，两者分开存
    // 前端希望平铺成：{ userId, username, role, disabled, balanceCents, productBalances,
    //   profile:{nickname, occupation, detail, preferences, globalMemories}, globalMemories }
    var u = bu || {};
    var bp = u.profile || {};
    var mems = u.globalMemories || fallbackMems || [];
    // email/phone 后端可能放在顶层 u.email/u.phone 或 profile.email/profile.phone，两种都兼容
    var email = u.email || bp.email || '';
    var phone = u.phone || bp.phone || '';
    return {
      userId: u.userId,
      username: u.username,
      role: u.role || 'user',         // 系统权限
      disabled: !!u.disabled,
      email: email,
      phone: phone,
      balanceCents: u.balanceCents || 0,         // 旧单一钱包（向后兼容）
      frozenCents: u.frozenCents || 0,
      productBalances: u.productBalances || [],  // 分产品余额（新）
      profile: {
        nickname: u.nickname || '',
        occupation: bp.role || '',     // 职业/职位（前端用 occupation 命名，后端用 profile.role）
        detail: bp.bio || '',
        preferences: bp.preferences || '',
        email: email,                  // 放 profile 里一份方便 form 统一 bind
        phone: phone,
        globalMemories: mems
      },
      globalMemories: mems
    };
  },

  // ─── 8 个 method 的前端 adapter（公开 API）───

  async register(p){
    // 前端 p: { username, password, profile:{nickname,occupation,detail,preferences,globalMemories}, securityQuestions:[{question,answer},...] }
    // REST POST /api/auth/register 一次性收 profile + securityQuestions（后端落库时拆字段），
    // 不再像龙虾 WS 那样分 register→profile.update→memory.set 三步。
    var fp = p.profile || {};
    var profilePayload = {
      nickname: fp.nickname || '',
      occupation: fp.occupation || '',
      detail: fp.detail || '',
      preferences: fp.preferences || ''
    };
    // globalMemories 仅在非空时传（避免后端对空数组的 INVALID_REQUEST 兜底）
    if(fp.globalMemories && fp.globalMemories.length){
      profilePayload.globalMemories = fp.globalMemories;
    }
    if(fp.email) profilePayload.email = fp.email;
    if(fp.phone) profilePayload.phone = fp.phone;

    var r = await Real._rest('/api/auth/register', {
      body: {
        username: p.username,
        password: p.password,
        profile: profilePayload,
        // 后端 register 强制要 2 个安全问题：[{question,answer},{question,answer}]
        securityQuestions: p.securityQuestions
      }
    });
    if(!r.ok) return r;

    // 后端 register 返回平铺：{userId, username, sessionToken, role, email, phone,
    //   balanceCents, profile{...}, globalMemories, user(完整对象)}
    var d = r.data;
    // 优先用完整 user 对象走统一映射，拿到余额等字段；没有则用平铺字段兜底
    var flat = d.user ? Real._fromBackendUser(d.user) : {
      userId: d.userId,
      username: d.username,
      role: d.role || 'user',
      disabled: !!d.disabled,
      email: d.email || '',
      phone: d.phone || '',
      balanceCents: d.balanceCents || 0,
      productBalances: d.productBalances || [],
      profile: {
        nickname: (d.profile && d.profile.nickname) || fp.nickname || '',
        occupation: (d.profile && d.profile.occupation) || fp.occupation || '',
        detail: (d.profile && d.profile.detail) || fp.detail || '',
        preferences: (d.profile && d.profile.preferences) || fp.preferences || '',
        globalMemories: (d.profile && d.profile.globalMemories) || d.globalMemories || []
      },
      globalMemories: d.globalMemories || []
    };
    flat.sessionToken = d.sessionToken;
    return ok(flat);
  },

  async login(p){
    var r = await Real._rest('/api/auth/login', {
      body: { username: p.username, password: p.password }
    });
    if(!r.ok) return r;
    // 后端 login 返回平铺 user + sessionToken + user(完整对象)
    var d = r.data;
    var flat = d.user ? Real._fromBackendUser(d.user) : Real._fromBackendUser(d);
    flat.sessionToken = d.sessionToken;
    return ok(flat);
  },

  async logout(p){
    return Real._rest('/api/auth/logout', {
      token: p.sessionToken,
      body: { sessionToken: p.sessionToken }
    });
  },

  async recover_questions(p){
    var r = await Real._rest('/api/auth/recover_questions', {
      body: { username: p.username }
    });
    if(!r.ok) return r;
    // 后端返回 {questions:[...]}
    return ok({ questions: r.data.questions || [] });
  },

  async recover(p){
    // 前端传 securityAnswers:[{question,answer},{question,answer}]
    // 后端两种都收：securityAnswers 对象数组 或 answers:["a1","a2"]。直接透传 securityAnswers。
    return Real._rest('/api/auth/recover', {
      body: {
        username: p.username,
        securityAnswers: p.securityAnswers || [],
        newPassword: p.newPassword
      }
    });
  },

  async me(p){
    // GET /api/auth/me，sessionToken 走 query + Bearer 双保险
    var r = await Real._rest('/api/auth/me', {
      method: 'GET',
      token: p.sessionToken,
      query: { sessionToken: p.sessionToken }
    });
    if(!r.ok) return r;
    return ok(Real._fromBackendUser(r.data.user || r.data));
  },

  async profile_update(p){
    // 前端 p.profile:{nickname,occupation,detail,preferences,email,phone,globalMemories}
    // 后端 POST /api/auth/profile 一次收完（含 globalMemories），无需再单独 memory.set
    var fp = p.profile || {};
    var profilePayload = {
      nickname: fp.nickname,
      occupation: fp.occupation,
      detail: fp.detail,
      preferences: fp.preferences
    };
    if(fp.email !== undefined) profilePayload.email = fp.email;
    if(fp.phone !== undefined) profilePayload.phone = fp.phone;
    if(fp.globalMemories !== undefined) profilePayload.globalMemories = fp.globalMemories;

    var r = await Real._rest('/api/auth/profile', {
      token: p.sessionToken,
      body: { sessionToken: p.sessionToken, profile: profilePayload }
    });
    if(!r.ok) return r;

    // 后端返回 {ok, profile:{nickname,occupation,detail,preferences,email,phone,globalMemories}, user}
    var bp = r.data.profile || {};
    var returnProfile = {
      nickname: bp.nickname || fp.nickname || '',
      occupation: bp.occupation || fp.occupation || '',
      detail: bp.detail || fp.detail || '',
      preferences: bp.preferences || fp.preferences || '',
      email: bp.email !== undefined ? bp.email : (fp.email || ''),
      phone: bp.phone !== undefined ? bp.phone : (fp.phone || ''),
      globalMemories: bp.globalMemories !== undefined ? bp.globalMemories : (fp.globalMemories || [])
    };
    return ok({ ok:true, profile: returnProfile, user: r.data.user });
  },

  async memory_set(p){
    var r = await Real._rest('/api/auth/memory', {
      token: p.sessionToken,
      body: { sessionToken: p.sessionToken, memories: p.memories }
    });
    if(!r.ok) return r;
    // 后端返回 {ok, memories:[...], globalMemories:[...]}
    return ok({ ok:true, memories: r.data.globalMemories || r.data.memories || [] });
  },

  async stats_me(p){
    // GET /api/auth/stats，返回 {conversationsTotal, tokensTotal, lastSessionAt, balanceCents}
    var r = await Real._rest('/api/auth/stats', {
      method: 'GET',
      token: p.sessionToken,
      query: { sessionToken: p.sessionToken }
    });
    if(!r.ok) return r;
    return ok({
      conversationsTotal: r.data.conversationsTotal || 0,
      tokensTotal: r.data.tokensTotal || 0,
      lastSessionAt: r.data.lastSessionAt || null,
      balanceCents: r.data.balanceCents || 0
    });
  },

  // ─── 钱包 / 卡密（REST，需登录）───
  async wallet_balances(p){
    // GET /api/wallet/balances → {balances:[{product,balanceCents,frozenCents}]}
    var r = await Real._rest('/api/wallet/balances', {
      method: 'GET',
      token: p.sessionToken,
      query: { sessionToken: p.sessionToken }
    });
    if(!r.ok) return r;
    return ok({ balances: r.data.balances || [] });
  },

  async redeem(p){
    // POST /api/redeem {code} → {code, product, addedCents, balanceCents}
    var r = await Real._rest('/api/redeem', {
      token: p.sessionToken,
      body: { sessionToken: p.sessionToken, code: p.code }
    });
    if(!r.ok) return r;
    return ok({
      code: r.data.code,
      product: r.data.product,
      addedCents: r.data.addedCents || 0,
      balanceCents: r.data.balanceCents || 0
    });
  },

  // A2 路线：前端在每一轮对话结束时调用，把 user + assistant 两条消息一起 flush 给后端
  // 后端写入 chat_messages / 更新 user_stats / 追加 jsonl
  async chat_flush(p){
    return Real._call('daoxu.chat.flush', p);
  },

  // chat history_v2：从 chat_messages 读取分页历史（替代旧 chat.history）
  async chat_history_v2(p){
    return Real._call('daoxu.chat.history_v2', p);
  },

  // 列出当前用户的所有会话（按 sessionKey 分组，每个 agent 一条）
  async chat_sessions_list(p){
    return Real._call('daoxu.chat.sessions.list', p);
  },

  // ─── Admin RPC（只有 role=admin 的 session 才能调）───
  async admin_users_list(p){
    return Real._call('daoxu.admin.users.list', p);
  },
  async admin_user_get(p){
    return Real._call('daoxu.admin.user.get', p);
  },
  async admin_user_update(p){
    return Real._call('daoxu.admin.user.update', p);
  },
  async admin_user_reset_password(p){
    return Real._call('daoxu.admin.user.reset_password', p);
  },
  async admin_user_delete(p){
    return Real._call('daoxu.admin.user.delete', p);
  }
};

var Backend = BACKEND_MODE === 'real' ? Real : Mock;

// ─────────────────────────── 公开 API ───────────────────────────

var Auth = {
  mode: BACKEND_MODE,

  // 当前登录状态
  isLoggedIn(){ return !!localStorage.getItem(STORAGE.CURRENT_TOKEN); },
  getToken(){ return localStorage.getItem(STORAGE.CURRENT_TOKEN); },
  getCachedUser(){
    try{ return JSON.parse(localStorage.getItem(STORAGE.CURRENT_USER) || 'null'); }
    catch(e){ return null; }
  },

  async register(payload){
    var r = await Backend.register(payload);
    if(r.ok) Auth._persistSession(r.data);
    return r;
  },

  async login(payload){
    var r = await Backend.login(payload);
    if(r.ok) Auth._persistSession(r.data);
    return r;
  },

  async logout(){
    var token = Auth.getToken();
    if(token) await Backend.logout({ sessionToken: token });
    localStorage.removeItem(STORAGE.CURRENT_TOKEN);
    localStorage.removeItem(STORAGE.CURRENT_USER);
    return { ok:true };
  },

  async getRecoverQuestions(username){
    return Backend.recover_questions({ username: username });
  },

  async recover(payload){
    return Backend.recover(payload);
  },

  async refreshMe(){
    var token = Auth.getToken();
    if(!token) return { ok:false, error:{code:'UNAUTHORIZED'} };
    var r = await Backend.me({ sessionToken: token });
    if(r.ok){
      localStorage.setItem(STORAGE.CURRENT_USER, JSON.stringify(r.data));
    }else if(r.error && (r.error.code === 'TOKEN_EXPIRED' || r.error.code === 'UNAUTHORIZED')){
      localStorage.removeItem(STORAGE.CURRENT_TOKEN);
      localStorage.removeItem(STORAGE.CURRENT_USER);
    }
    return r;
  },

  async updateProfile(profile){
    var token = Auth.getToken();
    if(!token) return { ok:false, error:{code:'UNAUTHORIZED'} };
    var r = await Backend.profile_update({ sessionToken: token, profile: profile });
    if(r.ok){
      var cur = Auth.getCachedUser() || {};
      cur.profile = r.data.profile;
      localStorage.setItem(STORAGE.CURRENT_USER, JSON.stringify(cur));
    }
    return r;
  },

  async setMemories(memories){
    var token = Auth.getToken();
    if(!token) return { ok:false, error:{code:'UNAUTHORIZED'} };
    var r = await Backend.memory_set({ sessionToken: token, memories: memories });
    if(r.ok){
      var cur = Auth.getCachedUser() || {};
      cur.profile = cur.profile || {};
      cur.profile.globalMemories = r.data.memories;
      cur.globalMemories = r.data.memories;
      localStorage.setItem(STORAGE.CURRENT_USER, JSON.stringify(cur));
    }
    return r;
  },

  async getStats(){
    var token = Auth.getToken();
    if(!token) return { ok:false, error:{code:'UNAUTHORIZED'} };
    return Backend.stats_me({ sessionToken: token });
  },

  // ─── 钱包 / 卡密（需登录）───
  // 返回 {ok, data:{balances:[{product,balanceCents,frozenCents}]}}
  async getWalletBalances(){
    var token = Auth.getToken();
    if(!token) return { ok:false, error:{code:'UNAUTHORIZED'} };
    return Backend.wallet_balances({ sessionToken: token });
  },
  // 兑换卡密。返回 {ok, data:{code,product,addedCents,balanceCents}}
  async redeemCode(code){
    var token = Auth.getToken();
    if(!token) return { ok:false, error:{code:'UNAUTHORIZED'} };
    if(!code || !String(code).trim()) return { ok:false, error:{code:'INVALID_REQUEST', message:'请输入卡密'} };
    return Backend.redeem({ sessionToken: token, code: String(code).trim() });
  },

  // A2：把一轮完整对话（user + assistant 两条）推给后端落盘 + 累计 stats
  // 登录用户直接 flush；未登录用户由调用方走 bufferLocalRun 存 localStorage，登录后 flushLocalBuffer 同步
  async chatFlush(batch){
    if(!Auth.isLoggedIn()) return { ok:false, error:{code:'NOT_LOGGED_IN'} };
    var token = Auth.getToken();
    var payload = Object.assign({ sessionToken: token }, batch);
    return Backend.chat_flush(payload);
  },

  // 未登录时把一轮对话存 localStorage（登录后会自动 sync 云端）
  bufferLocalRun(batch){
    if(!batch) return;
    try{
      var key = 'daoxu_local_chat_buffer';
      var arr = JSON.parse(localStorage.getItem(key) || '[]');
      arr.push(batch);
      // 限制最多存 100 轮，防止恶意或异常膨胀
      if(arr.length > 100) arr = arr.slice(-100);
      localStorage.setItem(key, JSON.stringify(arr));
    }catch(e){ console.warn('[bufferLocalRun]', e) }
  },

  // 登录成功后调：把本地 buffer 批量 sync 云端，替换匿名 vid 为真 userId
  async flushLocalBuffer(){
    if(!Auth.isLoggedIn()) return { ok:false, error:{code:'NOT_LOGGED_IN'} };
    var user = Auth.getCachedUser();
    if(!user || !user.userId) return { ok:false, error:{code:'NO_USER'} };
    var key = 'daoxu_local_chat_buffer';
    var arr;
    try{ arr = JSON.parse(localStorage.getItem(key) || '[]') }catch(e){ return {ok:false, error:{code:'PARSE_ERROR'}} }
    if(!arr.length) return { ok:true, synced:0 };
    var synced = 0, failed = 0;
    var newUserId = user.userId;
    for(var i=0;i<arr.length;i++){
      var b = arr[i];
      // 把匿名 vid 替换成真 user_id（sessionKey 尾部 peerId 部分 + 每条 message 的 userId/sessionKey）
      var newSessionKey = (b.sessionKey || '').replace(/:[^:]+$/, ':' + newUserId);
      var batch = {
        sessionKey: newSessionKey,
        userId: newUserId,
        messages: (b.messages || []).map(function(m){
          return Object.assign({}, m, { userId: newUserId, sessionKey: newSessionKey });
        }),
        conversationIncrement: b.conversationIncrement === undefined ? true : b.conversationIncrement,
        tokensTotal: b.tokensTotal || 0,
        lastSessionAt: b.lastSessionAt,
        rawJsonlPath: null
      };
      var r = await Auth.chatFlush(batch);
      if(r.ok) synced++; else failed++;
    }
    // 全部尝试完就清 localStorage（即使部分失败——重试风险>收益，避免重复）
    try{ localStorage.removeItem(key) }catch(e){}
    return { ok: failed===0, synced:synced, failed:failed };
  },

  // 从 chat_messages 读分页历史（替代旧 chat.history，能拿到 A2 flush 过去的数据）
  async getChatHistoryV2(params){
    var token = Auth.getToken();
    var payload = Object.assign({ sessionToken: token }, params);
    return Backend.chat_history_v2(payload);
  },

  // 列出当前用户的所有会话（每个 agent 一条，点进去看那个 agent 的完整对话记录）
  async getChatSessionsList(params){
    if(!Auth.isLoggedIn()) return { ok:false, error:{code:'UNAUTHORIZED'} };
    var token = Auth.getToken();
    return Backend.chat_sessions_list(Object.assign({sessionToken:token}, params||{}));
  },

  // ─── Admin 公开 API（需 role=admin，后端校验）───
  async adminUsersList(params){
    if(!Auth.isLoggedIn()) return { ok:false, error:{code:'UNAUTHORIZED'} };
    var token = Auth.getToken();
    return Backend.admin_users_list(Object.assign({sessionToken:token}, params||{}));
  },
  async adminUserGet(userId){
    if(!Auth.isLoggedIn()) return { ok:false, error:{code:'UNAUTHORIZED'} };
    return Backend.admin_user_get({ sessionToken: Auth.getToken(), userId: userId });
  },
  async adminUserUpdate(userId, patch){
    if(!Auth.isLoggedIn()) return { ok:false, error:{code:'UNAUTHORIZED'} };
    return Backend.admin_user_update({ sessionToken: Auth.getToken(), userId: userId, patch: patch });
  },
  async adminUserResetPassword(userId){
    if(!Auth.isLoggedIn()) return { ok:false, error:{code:'UNAUTHORIZED'} };
    return Backend.admin_user_reset_password({ sessionToken: Auth.getToken(), userId: userId });
  },
  async adminUserDelete(userId){
    if(!Auth.isLoggedIn()) return { ok:false, error:{code:'UNAUTHORIZED'} };
    return Backend.admin_user_delete({ sessionToken: Auth.getToken(), userId: userId });
  },

  // 给 chat connect 用：返回要塞进 connect.params 的字段
  getChatAuthFields(){
    var token = Auth.getToken();
    var user = Auth.getCachedUser();
    if(!token || !user) return {};
    return { sessionToken: token, sessionOwnerId: user.userId };
  },

  _persistSession(data){
    if(data.sessionToken) localStorage.setItem(STORAGE.CURRENT_TOKEN, data.sessionToken);
    var user = {
      userId: data.userId,
      username: data.username,
      role: data.role || 'user',       // 系统权限，admin/users.html 判断用
      disabled: !!data.disabled,
      email: data.email || (data.profile && data.profile.email) || '',
      phone: data.phone || (data.profile && data.profile.phone) || '',
      balanceCents: data.balanceCents || 0,
      productBalances: data.productBalances || [],
      profile: data.profile || {},
      globalMemories: (data.profile && data.profile.globalMemories) || []
    };
    localStorage.setItem(STORAGE.CURRENT_USER, JSON.stringify(user));
  },

  // 当前登录用户是否是管理员
  isAdmin(){
    var u = Auth.getCachedUser();
    return !!(u && u.role === 'admin');
  },

  // 调试用
  _dumpMockUsers(){
    if(BACKEND_MODE !== 'mock') return null;
    return loadJSON(STORAGE.USERS, {});
  }
};

global.DaoxuAuth = Auth;
console.log('[DaoxuAuth] backend mode:', BACKEND_MODE);

})(window);
