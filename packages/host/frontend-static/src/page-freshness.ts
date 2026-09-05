/** Browser recovery independent of the possibly obsolete application bundle. */

/**
 * Emit the page-owned runtime check and explicit reload notice.
 * @param startedAt - activation timestamp embedded in the served HTML.
 * @param intervalMs - visible-page checking interval configured by the host.
 * @returns inline JavaScript with no credentials, content digests, or session data.
 */
export function pageFreshnessScript(startedAt: number, intervalMs: number): string {
  return `(() => {
  const copy = {
    en: { restart: 'DSH restarted or updated. Reload this page to view complete conversations.', auth: 'This window needs to sign in again. Your conversations have not been deleted.', action: 'Reload and reconnect' },
    zh: { restart: 'DSH 已重启或更新，请重新加载页面以查看完整对话。', auth: '当前窗口需要重新登录，你的对话记录并未删除。', action: '重新加载并连接' }
  };
  const t = copy[navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en'];
  let pending = false;
  let notice;
  function show(reason) {
    if (notice) return;
    notice = document.createElement('div');
    notice.id = 'dsh-page-recovery';
    notice.setAttribute('role', 'alert');
    notice.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483647;max-width:calc(100vw - 48px);box-sizing:border-box;display:flex;align-items:center;gap:16px;padding:14px 18px;border:1px solid #d8dee8;border-radius:12px;background:#fff;color:#111827;box-shadow:0 4px 24px #0002;font:14px/1.5 system-ui,sans-serif';
    const text = document.createElement('span');
    text.textContent = t[reason];
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = t.action;
    button.style.cssText = 'flex-shrink:0;padding:8px 12px;border:0;border-radius:8px;background:#2563eb;color:#fff;font:inherit;cursor:pointer';
    button.addEventListener('click', () => location.reload());
    notice.append(text, button);
    document.body.append(notice);
  }
  async function check() {
    if (pending || notice || document.hidden) return;
    pending = true;
    try {
      const response = await fetch('/__dsh/runtime', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(${String(intervalMs)}) });
      if (response.status === 401) show('auth');
      else if (response.ok) {
        const runtime = await response.json();
        if (typeof runtime.startedAt === 'number' && runtime.startedAt !== ${String(startedAt)}) show('restart');
      }
    } catch {
      // A stopped or unreachable host cannot establish whether this page is current.
    } finally { pending = false; }
  }
  window.addEventListener('focus', check);
  window.addEventListener('pageshow', check);
  document.addEventListener('visibilitychange', check);
  window.setInterval(check, ${String(intervalMs)});
})();`
}
