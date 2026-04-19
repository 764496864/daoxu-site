// 道序账户系统客户端 SDK
// 同一份接口，两种 backend 模式：
//   MOCK：localStorage 模拟（V1 阶段使用，前端独立可跑）
//   REAL：龙虾 OpenClaw WebSocket（V1 联调后切换）
//
// 切换：把页面里的 <script> 引入加 ?mode=real 或者 localStorage.setItem('daoxu_auth_mode','real')
//
// 调用方所有方法都返回 Promise<{ ok, data?, error? }>

(function(global){
'use strict';

// v2.5.5 迁移：龙虾 daoxu-auth plugin 24/7 已上线，Real 成为默认
// 如果之前在 Mock 模式下存过数据，清掉（因为那些账户不在真后端）
(function migrateToReal(){
  try{
    if(localStorage.getItem('daoxu_auth_migrated_v255') !== '1'){
      ['daoxu_mock_users','daoxu_mock_sessions','daoxu_session_token','daoxu_current_user'].forEach(function(k){
        localStorage.removeItem(k);
      });
      if(localStorage.getItem('daoxu_auth_mode') === 'mock'){
        localStorage.removeItem('daoxu_auth_mode');
      }
      localStorage.setItem('daoxu_auth_migrated_v255','1');
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
  return 'real'; // v2.5.5 起默认 real，龙虾 plugin 已 24/7 在线
})();

// 账户 RPC 独立 WS 连接（跟 index.html 聊天 WS 隔离，避免互相干扰）
// 接龙虾 daoxu-auth plugin（v2.5+）。session 用 'agent:main:auth-rpc' 凑合 OpenClaw 的 session param 校验。
// 联调时如果龙虾后端需要别的 session 格式，改这一行即可。
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

  async chat_flush(p){
    // Mock：空壳（前端独立开发期不对接后端）。返回 ok，不做任何落盘。
    return ok({ ok:true });
  },
  async chat_history_v2(p){ return ok({ sessionKey:p.sessionKey, total:0, offset:0, limit:p.limit||50, hasMore:false, messages:[] }) },
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
    // 后端 user.me 返回：{ user: {userId, username, nickname, role:'admin'|'user', disabled, profile:{role,bio,preferences}, globalMemories} }
    // 注意：顶层 role 是系统权限（admin/user），profile.role 是用户填的"职业/职位"，两者分开存
    // 前端希望平铺成：{ userId, username, role, disabled, profile:{nickname, occupation, detail, preferences, globalMemories}, globalMemories }
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
    var fp = p.profile || {};
    var nickname = fp.nickname || '';

    // Step 1: daoxu.user.register（只带最小必填 + 昵称）
    var r1 = await Real._call('daoxu.user.register', {
      username: p.username,
      password: p.password,
      nickname: nickname || undefined,
      securityQuestions: p.securityQuestions
    });
    if(!r1.ok) return r1;

    var token = r1.data.sessionToken;
    var userId = r1.data.user && r1.data.user.userId;
    var username = r1.data.user && r1.data.user.username;

    // Step 2: daoxu.profile.update（如果 occupation/detail/preferences 非空）
    var hasExtra = fp.occupation || fp.detail || fp.preferences;
    if(hasExtra){
      var r2 = await Real._call('daoxu.profile.update', {
        sessionToken: token,
        profile: Real._toBackendProfile({
          occupation: fp.occupation || '',
          detail: fp.detail || '',
          preferences: fp.preferences || ''
        })
      });
      // 忽略失败，MVP 阶段 profile 字段丢了用户能在 profile.html 重填
      if(!r2.ok) console.warn('[auth] register→profile.update failed, continuing', r2.error);
    }

    // Step 3: daoxu.memory.set（如果 globalMemories 有内容）
    var mems = (fp.globalMemories && fp.globalMemories.length) ? fp.globalMemories : [];
    if(mems.length){
      var r3 = await Real._call('daoxu.memory.set', {
        sessionToken: token,
        memories: mems
      });
      if(!r3.ok) console.warn('[auth] register→memory.set failed, continuing', r3.error);
    }

    // 返回前端期望的平铺格式
    return ok({
      userId: userId,
      username: username,
      sessionToken: token,
      profile: {
        nickname: nickname,
        occupation: fp.occupation || '',
        detail: fp.detail || '',
        preferences: fp.preferences || '',
        globalMemories: mems
      }
    });
  },

  async login(p){
    var r = await Real._call('daoxu.user.login', { username: p.username, password: p.password });
    if(!r.ok) return r;
    var token = r.data.sessionToken;
    var basicUser = r.data.user || {};

    // login 返回只有 {userId, username, nickname}，立即拉一次 me 拿完整 profile
    var meResp = await Real._call('daoxu.user.me', { sessionToken: token });
    if(!meResp.ok){
      // 拉 me 失败也返回 login 基本信息（profile 空）
      return ok({
        userId: basicUser.userId,
        username: basicUser.username,
        sessionToken: token,
        profile: { nickname: basicUser.nickname || '', occupation:'', detail:'', preferences:'', globalMemories:[] }
      });
    }
    var flat = Real._fromBackendUser(meResp.data.user || meResp.data);
    flat.sessionToken = token;
    return ok(flat);
  },

  async logout(p){
    return Real._call('daoxu.user.logout', { sessionToken: p.sessionToken });
  },

  async recover_questions(p){
    var r = await Real._call('daoxu.user.recover_questions', { username: p.username });
    if(!r.ok) return r;
    // 后端返回 {userId, questions} → 前端只关心 questions
    return ok({ questions: r.data.questions || [] });
  },

  async recover(p){
    // 前端传 securityAnswers:[{question,answer}, {question,answer}]
    // 后端只要 answers:["a1","a2"]
    var answers = (p.securityAnswers || []).map(function(x){ return x.answer });
    return Real._call('daoxu.user.recover', {
      username: p.username,
      answers: answers,
      newPassword: p.newPassword
    });
  },

  async me(p){
    var r = await Real._call('daoxu.user.me', { sessionToken: p.sessionToken });
    if(!r.ok) return r;
    return ok(Real._fromBackendUser(r.data.user || r.data));
  },

  async profile_update(p){
    // 前端 p.profile:{nickname,occupation,detail,preferences,globalMemories}
    // 后端 profile.update 接受 {nickname,role,bio,preferences}，memories 独立走 memory.set
    var fp = p.profile || {};

    var r1 = await Real._call('daoxu.profile.update', {
      sessionToken: p.sessionToken,
      profile: Real._toBackendProfile(fp)
    });
    if(!r1.ok) return r1;

    var memsResult = null;
    if(fp.globalMemories !== undefined){
      var r2 = await Real._call('daoxu.memory.set', {
        sessionToken: p.sessionToken,
        memories: fp.globalMemories
      });
      if(r2.ok) memsResult = r2.data.globalMemories || [];
      else console.warn('[auth] profile.update→memory.set failed', r2.error);
    }

    var bp = r1.data.profile || {};
    var returnProfile = {
      nickname: bp.nickname || fp.nickname || '',
      occupation: bp.role || fp.occupation || '',
      detail: bp.bio || fp.detail || '',
      preferences: bp.preferences || fp.preferences || '',
      globalMemories: memsResult !== null ? memsResult : (fp.globalMemories || [])
    };
    return ok({ ok:true, profile: returnProfile });
  },

  async memory_set(p){
    var r = await Real._call('daoxu.memory.set', {
      sessionToken: p.sessionToken,
      memories: p.memories
    });
    if(!r.ok) return r;
    return ok({ ok:true, memories: r.data.globalMemories || [] });
  },

  async stats_me(p){
    // 龙虾 V1 返回 {conversationsTotal, tokensTotal, lastSessionAt}
    var r = await Real._call('daoxu.stats.me', { sessionToken: p.sessionToken });
    if(!r.ok) return r;
    return ok({
      conversationsTotal: r.data.conversationsTotal || 0,
      tokensTotal: r.data.tokensTotal || 0,
      lastSessionAt: r.data.lastSessionAt || null
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

  // A2：把一轮完整对话（user + assistant 两条）推给后端落盘 + 累计 stats
  // 未登录直接跳过（匿名用户不走持久化）。登录用户只需在 chat final 时调一次。
  async chatFlush(batch){
    if(!Auth.isLoggedIn()) return { ok:false, error:{code:'NOT_LOGGED_IN'} };
    var token = Auth.getToken();
    // 附带 sessionToken 让后端校验调用方（必填）
    var payload = Object.assign({ sessionToken: token }, batch);
    return Backend.chat_flush(payload);
  },

  // 从 chat_messages 读分页历史（替代旧 chat.history，能拿到 A2 flush 过去的数据）
  async getChatHistoryV2(params){
    var token = Auth.getToken();
    var payload = Object.assign({ sessionToken: token }, params);
    return Backend.chat_history_v2(payload);
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
