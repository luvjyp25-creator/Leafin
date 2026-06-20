/* Leafin 雲端同步（Google Sign-In + Drive appDataFolder）。純前端、零後端。
   未設定 GOOGLE_CLIENT_ID 或未登入時，全站行為與現狀一致（資料只在本機 localStorage）。
   設定步驟見 docs/setup-google-signin.md。 */
(function () {
  'use strict';

  const LEAFIN_SYNC_CONFIG = {
    GOOGLE_CLIENT_ID: '652509750726-56hedfeo1g83fbvakflf1a0bm9s9h0ln.apps.googleusercontent.com',
  };

  const PREFIX = 'leafin_';
  const META_KEY = 'leafin_sync_meta';        // {updatedAt} 本機同步基準（不上傳）
  const ENABLED_KEY = 'leafin_sync_enabled';  // '1' 表使用者已啟用過同步（決定是否靜默登入）
  const SESSION_KEY = 'leafin_sync_session';  // sessionStorage：同分頁 session 內保留登入（切頁/重整不掉）
  const FILE_NAME = 'leafin-data.json';
  const SCOPE = 'openid email profile https://www.googleapis.com/auth/drive.appdata';
  const DEBOUNCE_MS = 3000;
  const EXCLUDE = new Set([META_KEY, ENABLED_KEY, 'leafin_sync_hint_dismissed', 'leafin_sync_reloaded']);

  const DRIVE = 'https://www.googleapis.com/drive/v3';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

  // 保留原生 setItem，供寫回雲端資料時不再觸發 dirty
  const _rawSet = localStorage.setItem.bind(localStorage);

  let accessToken = null;
  let tokenClient = null;
  let cachedFileId = null;
  let dirty = false;
  let debounceTimer = null;
  const listeners = [];
  const state = { status: 'unconfigured', user: null, lastSync: null, error: null };
  // status: 'unconfigured' | 'signedout' | 'signedin' | 'syncing' | 'synced' | 'offline' | 'error'

  function emit() { listeners.forEach(fn => { try { fn(state); } catch (e) {} }); }
  function setStatus(s) { state.status = s; emit(); }
  function onChange(fn) { listeners.push(fn); try { fn(state); } catch (e) {} }

  /* ── 資料打包 ── */
  function collectBundle() {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.indexOf(PREFIX) === 0 && !EXCLUDE.has(k)) data[k] = localStorage.getItem(k);
    }
    return data;
  }
  function applyBundle(data) {
    Object.keys(data || {}).forEach(k => {
      if (k.indexOf(PREFIX) === 0 && !EXCLUDE.has(k)) _rawSet(k, data[k]);
    });
  }
  function localMeta() { try { return JSON.parse(localStorage.getItem(META_KEY)) || {}; } catch (e) { return {}; } }
  function setLocalMeta(m) { _rawSet(META_KEY, JSON.stringify(m)); }

  /* sessionStorage 內保留登入：同分頁切頁/重整不掉登入（憑證到期或關分頁才需重點） */
  function saveSession(token, expiresInSec, user) {
    try {
      const expiresAt = Date.now() + (Number(expiresInSec) || 3600) * 1000 - 60000; // 提前 60s 視為過期
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token: token, expiresAt: expiresAt, user: user }));
    } catch (e) {}
  }
  function loadSession() { try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch (e) { return null; } }
  function clearSession() { try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {} }

  /* ── setItem 攔截器：任何頁面寫 leafin_* → 標 dirty + 重置 debounce ── */
  localStorage.setItem = function (k, v) {
    _rawSet(k, v);
    if (typeof k === 'string' && k.indexOf(PREFIX) === 0 && !EXCLUDE.has(k)) {
      dirty = true;
      scheduleSyncUp();
    }
  };

  /* ── GIS 認證 ── */
  function loadGis() {
    return new Promise(function (resolve, reject) {
      if (window.google && google.accounts && google.accounts.oauth2) return resolve();
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true; s.defer = true;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('GIS 載入失敗')); };
      document.head.appendChild(s);
    });
  }

  async function fetchUserInfo() {
    if (!accessToken) return null;
    try {
      const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: 'Bearer ' + accessToken },
      });
      if (!r.ok) return null;
      const u = await r.json();
      return { name: u.name || u.email, email: u.email, picture: u.picture };
    } catch (e) { return null; }
  }

  async function onToken(resp) {
    if (resp && resp.error) { setStatus('signedout'); return; }
    accessToken = resp.access_token;
    _rawSet(ENABLED_KEY, '1');
    state.user = await fetchUserInfo();
    saveSession(accessToken, resp.expires_in, state.user);
    setStatus('signedin');
    onSignedInSync();
  }

  async function initAuth() {
    const id = LEAFIN_SYNC_CONFIG.GOOGLE_CLIENT_ID;
    if (!id) { setStatus('unconfigured'); return; }
    // 先從 sessionStorage 還原登入（同分頁切頁/重整不掉登入）
    const s = loadSession();
    if (s && s.token && s.expiresAt > Date.now()) {
      accessToken = s.token;
      state.user = s.user || null;
      setStatus('signedin');
      onSignedInSync();
    }
    try { await loadGis(); } catch (e) { if (!accessToken) setStatus('offline'); return; }
    tokenClient = google.accounts.oauth2.initTokenClient({ client_id: id, scope: SCOPE, callback: onToken });
    if (!accessToken) {
      setStatus('signedout');
      // 先前已啟用過同步 → 嘗試靜默取得 token（第三方 cookie 被擋時可能失敗，屬正常）
      if (localStorage.getItem(ENABLED_KEY) === '1') {
        try { tokenClient.requestAccessToken({ prompt: '' }); } catch (e) {}
      }
    }
  }

  function signIn() {
    if (!LEAFIN_SYNC_CONFIG.GOOGLE_CLIENT_ID) { alert('尚未設定雲端同步（請見設定頁說明）'); return; }
    if (!tokenClient) return;
    tokenClient.requestAccessToken({ prompt: 'consent' });
  }
  function signOut() {
    const t = accessToken;
    accessToken = null;
    cachedFileId = null;
    clearSession();
    _rawSet(ENABLED_KEY, '0');
    state.user = null;
    setStatus('signedout');
    if (t && window.google && google.accounts && google.accounts.oauth2) {
      try { google.accounts.oauth2.revoke(t, function () {}); } catch (e) {}
    }
  }

  /* ── Drive REST ── */
  function authHeaders(extra) { return Object.assign({ Authorization: 'Bearer ' + accessToken }, extra || {}); }

  async function findFileId() {
    const q = encodeURIComponent("name='" + FILE_NAME + "'");
    const url = DRIVE + '/files?spaces=appDataFolder&q=' + q + '&fields=files(id,modifiedTime)';
    const r = await fetch(url, { headers: authHeaders() });
    if (!r.ok) throw new Error('findFile ' + r.status);
    const j = await r.json();
    return (j.files && j.files[0]) ? j.files[0].id : null;
  }
  async function readFile(id) {
    const r = await fetch(DRIVE + '/files/' + id + '?alt=media', { headers: authHeaders() });
    if (!r.ok) throw new Error('readFile ' + r.status);
    return r.json();
  }
  async function createFile(payload) {
    const boundary = 'leafin' + Date.now();
    const metadata = { name: FILE_NAME, parents: ['appDataFolder'] };
    const body =
      '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) + '\r\n' +
      '--' + boundary + '\r\nContent-Type: application/json\r\n\r\n' +
      payload + '\r\n--' + boundary + '--';
    const r = await fetch(UPLOAD + '/files?uploadType=multipart&fields=id', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'multipart/related; boundary=' + boundary }),
      body: body,
    });
    if (!r.ok) throw new Error('createFile ' + r.status);
    const j = await r.json();
    return j.id;
  }
  async function updateFile(id, payload) {
    const r = await fetch(UPLOAD + '/files/' + id + '?uploadType=media', {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: payload,
    });
    if (!r.ok) throw new Error('updateFile ' + r.status);
    return id;
  }

  /* ── 同步 ── */
  async function syncUp() {
    if (!accessToken) return;
    setStatus('syncing');
    try {
      const updatedAt = Date.now();
      const payload = JSON.stringify({ schema: 1, updatedAt: updatedAt, data: collectBundle() });
      if (cachedFileId == null) cachedFileId = await findFileId();
      if (cachedFileId) await updateFile(cachedFileId, payload);
      else cachedFileId = await createFile(payload);
      setLocalMeta({ updatedAt: updatedAt });
      dirty = false; state.lastSync = updatedAt; state.error = null; setStatus('synced');
    } catch (e) { handleSyncError('syncUp', e); }
  }

  async function syncDown() {
    if (!accessToken) return false;
    setStatus('syncing');
    try {
      cachedFileId = await findFileId();
      if (!cachedFileId) { setStatus('synced'); return false; }
      const remote = await readFile(cachedFileId);
      const localUpdated = localMeta().updatedAt || 0;
      if (remote && remote.updatedAt > localUpdated) {
        applyBundle(remote.data);
        setLocalMeta({ updatedAt: remote.updatedAt });
        state.lastSync = remote.updatedAt; setStatus('synced');
        return true;
      }
      if (remote) state.lastSync = remote.updatedAt;
      state.error = null; setStatus('synced'); return false;
    } catch (e) { handleSyncError('syncDown', e); return false; }
  }

  // 同步錯誤處理：401 視為登入過期 → 清 session、退回未登入讓使用者重點；其餘顯示錯誤
  function handleSyncError(where, e) {
    const msg = String((e && e.message) || e);
    state.error = msg;
    console.error('[LeafinSync] ' + where, e);
    if (msg.indexOf('401') >= 0) { accessToken = null; clearSession(); setStatus('signedout'); }
    else setStatus('error');
  }

  async function syncNow() { await syncDown(); await syncUp(); }

  /* ── 生命週期 ── */
  function scheduleSyncUp() {
    if (!accessToken) return; // 未登入不上傳
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function () { syncUp(); }, DEBOUNCE_MS);
  }

  async function onSignedInSync() {
    const changed = await syncDown();
    // 雲端較新 → 重整一次讓各頁以新資料重繪（sessionStorage 防迴圈）
    if (changed && !sessionStorage.getItem('leafin_sync_reloaded')) {
      sessionStorage.setItem('leafin_sync_reloaded', '1');
      location.reload();
      return;
    }
    if (dirty) syncUp();
  }

  function flush() { if (dirty && accessToken) { clearTimeout(debounceTimer); syncUp(); } }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(); });
  window.addEventListener('beforeunload', flush);

  /* ── topbar 同步小圖示自動綁定（各頁只需放 <span id="sync-indicator">） ── */
  function bindIndicator() {
    const el = document.getElementById('sync-indicator');
    if (!el) return;
    const map = { unconfigured: '', signedout: '', signedin: '☁', syncing: '⟳ 同步中', synced: '☁ 已同步', error: '⚠ 同步問題', offline: '' };
    onChange(function (st) { el.textContent = map[st.status] || ''; });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindIndicator);
  else bindIndicator();

  /* ── 公開 API ── */
  window.LeafinSync = {
    collectBundle: collectBundle,
    applyBundle: applyBundle,
    isDirty: function () { return dirty; },
    getState: function () { return state; },
    onChange: onChange,
    signIn: signIn,
    signOut: signOut,
    syncUp: syncUp,
    syncDown: syncDown,
    syncNow: syncNow,
    _token: { get: function () { return accessToken; }, set: function (t) { accessToken = t; } },
  };

  initAuth();
})();
