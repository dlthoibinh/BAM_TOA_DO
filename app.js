(() => {
  'use strict';

  const APP_URL = 'https://script.google.com/macros/s/AKfycbz0t4JwFBhgcS6fhLVNIqyFOhTEa3Mb7HjNorepXneZqG_G3J8osKPzHRyeSPb2PGz7/exec';
  const SHELL_VERSION = '3.0.0-20260717';
  const LOAD_TIMEOUT_MS = 25_000;
  const RECOVERY_BUTTON_DELAY_MS = 12_000;
  const LOG_KEY = 'evn_toado_shell_log_v3';
  const MAX_LOG_ITEMS = 80;

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

  const nowIso = () => new Date().toISOString();

  function safeStorageGet(key) {
    try { return localStorage.getItem(key); } catch (_) { return null; }
  }

  function safeStorageSet(key, value) {
    try { localStorage.setItem(key, value); } catch (_) { /* Storage may be disabled. */ }
  }

  function writeLog(type, detail = '') {
    try {
      const current = JSON.parse(safeStorageGet(LOG_KEY) || '[]');
      const items = Array.isArray(current) ? current : [];
      items.push({ at: nowIso(), type, detail: String(detail).slice(0, 500) });
      safeStorageSet(LOG_KEY, JSON.stringify(items.slice(-MAX_LOG_ITEMS)));
    } catch (_) { /* Logging must never break the app. */ }
  }

  function updateViewportHeight() {
    const height = window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight;
    document.documentElement.style.setProperty('--app-height', `${Math.max(320, Math.round(height))}px`);
  }

  function setBootState({ message, busy, showActions }) {
    statusText.textContent = message;
    spinner.hidden = !busy;
    actions.classList.toggle('show', Boolean(showActions));
    boot.classList.remove('hidden');
  }

  function hideBoot() {
    boot.classList.add('hidden');
  }

  function clearTimers() {
    window.clearTimeout(loadTimer);
    window.clearTimeout(recoveryTimer);
  }

  function showTemporaryRecoveryButton(durationMs = 15_000) {
    window.clearTimeout(recoveryTimer);
    recoveryButton.classList.add('show');
    recoveryTimer = window.setTimeout(() => recoveryButton.classList.remove('show'), durationMs);
  }

  function startFrameLoad(reason = 'startup') {
    if (loading) return;
    loading = true;
    frameLoaded = false;
    clearTimers();
    recoveryButton.classList.remove('show');

    if (!navigator.onLine) {
      loading = false;
      setBootState({
        message: 'Điện thoại đang mất mạng. Ứng dụng sẽ kết nối lại khi có Internet.',
        busy: false,
        showActions: true
      });
      netBadge.classList.add('show');
      writeLog('load_blocked_offline', reason);
      return;
    }

    setBootState({ message: 'Đang kết nối ứng dụng…', busy: true, showActions: false });
    writeLog('frame_load_start', reason);

    // Gán src bằng JavaScript để luôn có màn hình chờ và cơ chế phục hồi nếu iframe bị lỗi.
    frame.src = APP_URL;

    loadTimer = window.setTimeout(() => {
      if (frameLoaded) return;
      loading = false;
      setBootState({
        message: 'Kết nối quá lâu hoặc ứng dụng bị trình duyệt tạm dừng. Anh/chị hãy nạp lại, dữ liệu trên máy không bị xóa bởi thao tác này.',
        busy: false,
        showActions: true
      });
      recoveryButton.classList.add('show');
      writeLog('frame_load_timeout', reason);
    }, LOAD_TIMEOUT_MS);
  }

  function reloadFrame(reason = 'manual') {
    clearTimers();
    loading = false;
    frameLoaded = false;
    try { frame.src = 'about:blank'; } catch (_) { /* Ignore. */ }
    window.setTimeout(() => startFrameLoad(reason), 120);
  }

  async function repairPwaCache() {
    setBootState({ message: 'Đang làm sạch cache PWA lỗi…', busy: true, showActions: false });
    writeLog('repair_start', SHELL_VERSION);

    try {
      if ('serviceWorker' in navigator) {
        const baseUrl = new URL('./', window.location.href).href;
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations
          .filter(registration => registration.scope.startsWith(baseUrl))
          .map(registration => registration.unregister()));
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys
          .filter(key => key.startsWith('evn-toado-shell-') || key.startsWith('toadokh-pwa-'))
          .map(key => caches.delete(key)));
      }
      writeLog('repair_success', SHELL_VERSION);
      window.location.reload();
    } catch (error) {
      writeLog('repair_failed', error?.message || error);
      setBootState({
        message: 'Không thể tự làm sạch cache. Hãy đóng hẳn ứng dụng rồi mở lại.',
        busy: false,
        showActions: true
      });
    }
  }

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    const base = location.pathname.endsWith('/')
      ? location.pathname
      : location.pathname.replace(/\/[^/]*$/, '/');

    try {
      const registration = await navigator.serviceWorker.register(`${base}sw.js?v=${encodeURIComponent(SHELL_VERSION)}`, {
        scope: base,
        updateViaCache: 'none'
      });
      writeLog('sw_registered', registration.scope);
      registration.update().catch(() => {});
    } catch (error) {
      writeLog('sw_register_failed', error?.message || error);
    }
  }

  frame.addEventListener('load', () => {
    // about:blank chỉ được dùng rất ngắn trong lúc khôi phục.
    if (frame.src === 'about:blank') return;
    window.clearTimeout(loadTimer);
    loading = false;
    frameLoaded = true;
    safeStorageSet('evn_toado_last_loaded_at', nowIso());
    writeLog('frame_load_success');
    hideBoot();
    recoveryButton.classList.remove('show');

    // Gửi tín hiệu không bắt buộc; phiên bản GAS mới có thể dùng để trả heartbeat.
    try {
      frame.contentWindow?.postMessage({ type: 'EVN_PWA_SHELL_READY', version: SHELL_VERSION }, 'https://script.google.com');
    } catch (_) { /* Cross-origin handshake is optional. */ }
  });

  frame.addEventListener('error', () => {
    clearTimers();
    loading = false;
    frameLoaded = false;
    writeLog('frame_error');
    setBootState({
      message: 'Không tải được ứng dụng. Kiểm tra mạng rồi bấm “Nạp lại ứng dụng”.',
      busy: false,
      showActions: true
    });
    recoveryButton.classList.add('show');
  });

  window.addEventListener('message', event => {
    if (!/^https:\/\/(script\.google\.com|[^/]+\.googleusercontent\.com)$/.test(event.origin)) return;
    if (event.data?.type === 'EVN_APP_HEARTBEAT') {
      frameLoaded = true;
      writeLog('app_heartbeat');
    }
  });

  window.addEventListener('online', () => {
    netBadge.classList.remove('show');
    writeLog('network_online');
    if (!frameLoaded && !loading) startFrameLoad('network_restored');
  });

  window.addEventListener('offline', () => {
    netBadge.classList.add('show');
    writeLog('network_offline');
    // Không tự tải lại iframe: tránh làm mất nội dung đang nhập/chụp ảnh chưa gửi.
    if (!frameLoaded) {
      setBootState({
        message: 'Mất kết nối mạng. Không đóng ứng dụng; hãy bật lại mạng rồi tiếp tục.',
        busy: false,
        showActions: true
      });
    }
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

    // Khi quay lại từ camera, tuyệt đối không tự reload iframe vì sẽ đá người dùng ra.
    if (!navigator.onLine) {
      netBadge.classList.add('show');
    } else if (!frameLoaded && !loading) {
      setBootState({
        message: 'Ứng dụng đã bị điện thoại tạm dừng. Bấm nạp lại để khôi phục.',
        busy: false,
        showActions: true
      });
      recoveryButton.classList.add('show');
    } else if (hiddenMs >= 2_000) {
      // Hiện tạm nút cứu hộ sau khi quay về từ camera/nền; không tự reload.
      showTemporaryRecoveryButton();
    }
  });

  window.addEventListener('pageshow', event => {
    updateViewportHeight();
    if (event.persisted) writeLog('page_restored_from_bfcache');
  });

  window.addEventListener('resize', updateViewportHeight, { passive: true });
  window.visualViewport?.addEventListener('resize', updateViewportHeight, { passive: true });
  window.visualViewport?.addEventListener('scroll', updateViewportHeight, { passive: true });

  window.addEventListener('error', event => writeLog('window_error', `${event.message} @ ${event.filename}:${event.lineno}`));
  window.addEventListener('unhandledrejection', event => writeLog('unhandled_rejection', event.reason?.message || event.reason || 'unknown'));

  retryButton.addEventListener('click', () => reloadFrame('retry_button'));
  recoveryButton.addEventListener('click', () => {
    setBootState({
      message: 'Chỉ nạp lại khi màn hình đang trắng hoặc không thao tác được.',
      busy: false,
      showActions: true
    });
  });
  repairButton.addEventListener('click', repairPwaCache);
  directButton.href = APP_URL;

  updateViewportHeight();
  registerServiceWorker();
  startFrameLoad('startup');
})();
