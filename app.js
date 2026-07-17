(() => {
  'use strict';

  const APP_URL = 'https://script.google.com/macros/s/AKfycbz0t4JwFBhgcS6fhLVNIqyFOhTEa3Mb7HjNorepXneZqG_G3J8osKPzHRyeSPb2PGz7/exec';
  const SHELL_VERSION = '4.0.0-20260717';
  const LOAD_TIMEOUT_MS = 35_000;
  const HEARTBEAT_TIMEOUT_MS = 38_000;
  const LOG_KEY = 'evn_toado_shell_log_v4';
  const MAX_LOG_ITEMS = 100;

  const frame = document.getElementById('appFrame');
  const boot = document.getElementById('boot');
  const statusText = document.getElementById('statusText');
  const spinner = document.getElementById('spinner');
  const actions = document.getElementById('actions');
  const retryButton = document.getElementById('retryButton');
  const directButton = document.getElementById('directButton');
  const repairButton = document.getElementById('repairButton');
  const recoveryButton = document.getElementById('recoveryButton');
  const netBadge = document.getElementById('netBadge');

  let loadTimer = 0;
  let recoveryTimer = 0;
  let frameLoaded = false;
  let loading = false;
  let hiddenAt = 0;
  let heartbeatSeen = false;
  let lastHeartbeatAt = 0;

  const nowIso = () => new Date().toISOString();
  const safeStorageGet = key => { try { return localStorage.getItem(key); } catch (_) { return null; } };
  const safeStorageSet = (key, value) => { try { localStorage.setItem(key, value); } catch (_) {} };

  function writeLog(type, detail = '') {
    try {
      const current = JSON.parse(safeStorageGet(LOG_KEY) || '[]');
      const items = Array.isArray(current) ? current : [];
      items.push({ at: nowIso(), type, detail: String(detail).slice(0, 500) });
      safeStorageSet(LOG_KEY, JSON.stringify(items.slice(-MAX_LOG_ITEMS)));
    } catch (_) {}
  }

  function updateViewportHeight() {
    const height = window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight;
    document.documentElement.style.setProperty('--app-height', `${Math.max(320, Math.round(height))}px`);
  }

  function setBootState({ message, busy = false, showActions = false }) {
    statusText.textContent = message;
    spinner.hidden = !busy;
    actions.classList.toggle('show', Boolean(showActions));
    boot.classList.remove('hidden');
  }

  function hideBoot() { boot.classList.add('hidden'); }
  function clearTimers() { clearTimeout(loadTimer); clearTimeout(recoveryTimer); }

  function showTemporaryRecoveryButton(durationMs = 15_000) {
    clearTimeout(recoveryTimer);
    recoveryButton.classList.add('show');
    recoveryTimer = setTimeout(() => recoveryButton.classList.remove('show'), durationMs);
  }

  function notifyInnerShellReady() {
    try {
      frame.contentWindow?.postMessage({ type: 'EVN_PWA_SHELL_READY', version: SHELL_VERSION }, '*');
    } catch (_) {}
  }

  function markHeartbeat(data) {
    heartbeatSeen = true;
    lastHeartbeatAt = Date.now();
    frameLoaded = true;
    loading = false;
    clearTimeout(loadTimer);
    safeStorageSet('evn_toado_last_heartbeat_at', nowIso());
    writeLog('app_heartbeat', data?.detail || data?.version || '');
    hideBoot();
    recoveryButton.classList.remove('show');
  }

  function startFrameLoad(reason = 'startup') {
    if (loading) return;
    loading = true;
    frameLoaded = false;
    heartbeatSeen = false;
    lastHeartbeatAt = 0;
    clearTimers();
    recoveryButton.classList.remove('show');

    if (!navigator.onLine) {
      loading = false;
      setBootState({
        message: 'Điện thoại đang mất mạng. Bản nháp và ảnh chưa gửi vẫn được giữ trên máy.',
        showActions: true
      });
      netBadge.classList.add('show');
      writeLog('load_blocked_offline', reason);
      return;
    }

    setBootState({ message: 'Đang mở ứng dụng và khôi phục phiên làm việc…', busy: true });
    writeLog('frame_load_start', reason);
    frame.src = APP_URL;

    loadTimer = setTimeout(() => {
      if (heartbeatSeen) return;
      loading = false;
      setBootState({
        message: 'Ứng dụng chưa phản hồi. Bấm nạp lại; phiên đăng nhập, biểu mẫu và ảnh nháp sẽ tự khôi phục.',
        showActions: true
      });
      recoveryButton.classList.add('show');
      writeLog('heartbeat_boot_timeout', reason);
    }, LOAD_TIMEOUT_MS);
  }

  function reloadFrame(reason = 'manual') {
    clearTimers();
    loading = false;
    frameLoaded = false;
    heartbeatSeen = false;
    try { frame.src = 'about:blank'; } catch (_) {}
    setTimeout(() => startFrameLoad(reason), 150);
  }

  async function repairPwaCache() {
    setBootState({ message: 'Đang làm sạch cache PWA lỗi…', busy: true });
    writeLog('repair_start', SHELL_VERSION);
    try {
      if ('serviceWorker' in navigator) {
        const baseUrl = new URL('./', location.href).href;
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations
          .filter(reg => reg.scope.startsWith(baseUrl))
          .map(reg => reg.unregister()));
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys
          .filter(key => key.startsWith('evn-toado-shell-') || key.startsWith('toadokh-pwa-'))
          .map(key => caches.delete(key)));
      }
      writeLog('repair_success', SHELL_VERSION);
      location.reload();
    } catch (error) {
      writeLog('repair_failed', error?.message || error);
      setBootState({ message: 'Không thể tự làm sạch cache. Đóng hẳn ứng dụng rồi mở lại.', showActions: true });
    }
  }

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    const base = location.pathname.endsWith('/') ? location.pathname : location.pathname.replace(/\/[^/]*$/, '/');
    try {
      const reg = await navigator.serviceWorker.register(`${base}sw.js?v=${encodeURIComponent(SHELL_VERSION)}`, {
        scope: base,
        updateViaCache: 'none'
      });
      writeLog('sw_registered', reg.scope);
      reg.update().catch(() => {});
    } catch (error) { writeLog('sw_register_failed', error?.message || error); }
  }

  frame.addEventListener('load', () => {
    if (frame.src === 'about:blank') return;
    loading = false;
    frameLoaded = true;
    safeStorageSet('evn_toado_last_frame_load_at', nowIso());
    writeLog('frame_dom_load');
    // Không coi sự kiện load là app đã sống: chờ heartbeat từ GAS để phát hiện trang trắng.
    setBootState({ message: 'Đang khôi phục đăng nhập và dữ liệu nháp…', busy: true });
    notifyInnerShellReady();
    setTimeout(notifyInnerShellReady, 1200);
  });

  frame.addEventListener('error', () => {
    clearTimers();
    loading = false;
    frameLoaded = false;
    writeLog('frame_error');
    setBootState({ message: 'Không tải được ứng dụng. Kiểm tra mạng rồi bấm “Nạp lại ứng dụng”.', showActions: true });
    recoveryButton.classList.add('show');
  });

  window.addEventListener('message', event => {
    if (!/^https:\/\/(script\.google\.com|[^/]+\.googleusercontent\.com)$/.test(event.origin)) return;
    const data = event.data || {};
    if (data.type === 'EVN_APP_HEARTBEAT') {
      markHeartbeat(data);
    } else if (data.type === 'EVN_APP_BOOTING') {
      writeLog('inner_booting', data.detail || '');
      setBootState({ message: 'Ứng dụng đang khởi động…', busy: true });
    } else if (data.type === 'EVN_APP_ERROR') {
      writeLog('inner_error', data.detail || '');
      setBootState({
        message: 'Ứng dụng gặp lỗi hiển thị. Bấm nạp lại để phục hồi phiên và bản nháp.',
        showActions: true
      });
      recoveryButton.classList.add('show');
    }
  });

  window.addEventListener('online', () => {
    netBadge.classList.remove('show');
    writeLog('network_online');
    if (!frameLoaded && !loading) startFrameLoad('network_restored');
    else notifyInnerShellReady();
  });

  window.addEventListener('offline', () => {
    netBadge.classList.add('show');
    writeLog('network_offline');
    if (!frameLoaded) setBootState({ message: 'Mất kết nối mạng. Bản nháp và ảnh vẫn được giữ trên máy.', showActions: true });
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      writeLog('app_hidden');
      return;
    }

    const hiddenMs = hiddenAt ? Date.now() - hiddenAt : 0;
    writeLog('app_visible', hiddenMs);
    updateViewportHeight();
    if (!navigator.onLine) {
      netBadge.classList.add('show');
    } else if (!frameLoaded && !loading) {
      setBootState({ message: 'Ứng dụng đã bị điện thoại thu hồi. Bấm nạp lại để tự phục hồi.', showActions: true });
      recoveryButton.classList.add('show');
    } else {
      notifyInnerShellReady();
      if (hiddenMs >= 2000) showTemporaryRecoveryButton();
    }
  });

  // Chỉ cảnh báo, không tự reload. Dữ liệu đang nhập không bao giờ bị shell tự ý xóa.
  setInterval(() => {
    if (document.hidden || !navigator.onLine || !heartbeatSeen) return;
    const age = Date.now() - lastHeartbeatAt;
    if (age > HEARTBEAT_TIMEOUT_MS) {
      writeLog('heartbeat_stale', age);
      setBootState({
        message: 'Ứng dụng không còn phản hồi, có thể điện thoại đã thu hồi WebView. Bấm nạp lại để khôi phục.',
        showActions: true
      });
      recoveryButton.classList.add('show');
    }
  }, 10_000);

  window.addEventListener('pageshow', event => {
    updateViewportHeight();
    if (event.persisted) { writeLog('page_restored_from_bfcache'); notifyInnerShellReady(); }
  });
  window.addEventListener('resize', updateViewportHeight, { passive: true });
  window.visualViewport?.addEventListener('resize', updateViewportHeight, { passive: true });
  window.visualViewport?.addEventListener('scroll', updateViewportHeight, { passive: true });
  window.addEventListener('error', event => writeLog('window_error', `${event.message} @ ${event.filename}:${event.lineno}`));
  window.addEventListener('unhandledrejection', event => writeLog('unhandled_rejection', event.reason?.message || event.reason || 'unknown'));

  retryButton.addEventListener('click', () => reloadFrame('retry_button'));
  recoveryButton.addEventListener('click', () => setBootState({
    message: 'Chỉ nạp lại khi màn hình trắng hoặc không thao tác được. Dữ liệu nháp sẽ tự phục hồi.',
    showActions: true
  }));
  repairButton.addEventListener('click', repairPwaCache);
  directButton.href = APP_URL;

  updateViewportHeight();
  registerServiceWorker();
  startFrameLoad('startup');
})();
