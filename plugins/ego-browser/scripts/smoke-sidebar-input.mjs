#!/usr/bin/env node
/**
 * smoke-sidebar-input.mjs — ego-browser 侧边栏输入链路冒烟测试
 *
 * 验证 Better Sidebar「Agent 浏览器」Tab 的点击/键盘输入能真实送达 agent 浏览器
 * 页面（2026-09 断线事故：liveImgTargetId 未绑定 → 输入静默丢弃）。
 *
 * 原理：
 *   1. 在 ego 浏览器里开一个目标页（example.com），注入 pointerdown 探针；
 *   2. 另开 DSH GUI 页面，展开侧边栏 Agent 浏览器 Tab，选中目标页标签；
 *   3. 对侧边栏实时画面中心做一次**真实 CDP 点击**；
 *   4. 目标页探针收到 pointerdown → PASS，否则 FAIL。
 *
 * 用法：
 *   node scripts/smoke-sidebar-input.mjs [--gui-url "http://127.0.0.1:3081/?token=..."]
 *   不带参数时自动从 ~/.dsh/web*.out.log 提取最新的带 token GUI 地址。
 *
 * 退出码：0 = PASS，1 = FAIL，2 = 环境/前置条件不满足。
 */
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CLI = join(PLUGIN_ROOT, 'runtime', 'ego-linux', 'bin', 'ego-browser.mjs');

// ── 参数 ──────────────────────────────────────────────────────────────────
function argValue(name) {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : null;
}

/** 从 ~/.dsh 的 web 启动日志里找最新的带 token GUI 地址（按文件 mtime 从新到旧）。 */
function findGuiUrl() {
  const dshHome = join(homedir(), '.dsh');
  let files;
  try {
    files = readdirSync(dshHome)
      .filter((f) => /^web.*\.out\.log$/.test(f))
      .map((f) => join(dshHome, f))
      .sort((a, b) => mtime(b) - mtime(a));
  } catch {
    return null;
  }
  for (const f of files) {
    const m = readFileSync(f, 'utf8').match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[\w-]+/);
    if (m) return m[0];
  }
  return null;
}
function mtime(f) {
  try {
    return statSync(f).mtimeMs;
  } catch {
    return 0;
  }
}

// ── heredoc：在 ego-browser nodejs 环境内执行（page/browser/taskSpaces/cdp 已注入）──
function buildHeredoc(guiUrl) {
  return `
const GUI_URL = ${JSON.stringify(guiUrl)};
const fail = (msg, extra) => {
  console.log('@@SMOKE@@' + JSON.stringify({ pass: false, stage: msg, ...(extra || {}) }));
};
try {
  // 1. 目标页 + 探针
  await taskSpaces.useOrCreate('ego-smoke-target');
  await page.goto('https://example.com');
  await page.waitForLoadState('load', { timeout: 15000 }).catch(() => {});
  await page.evaluate(() => {
    window.__egoSmokeProbe = { down: null };
    window.addEventListener('pointerdown', (e) => {
      window.__egoSmokeProbe.down = { x: e.clientX, y: e.clientY, t: Date.now() };
    }, true);
  });

  // 2. GUI 页面
  await taskSpaces.useOrCreate('ego-smoke-gui');
  await page.goto(GUI_URL);
  await page.waitForSelector('#root', { timeout: 20000 });
  await page.waitForTimeout(3000);

  // 展开 Better Sidebar（若收起）。注意：该按钮是图标按钮，文案在
  // aria-label/title 上，textContent 匹配不到。
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) =>
      /展开侧边栏/.test((b.textContent || '') + (b.getAttribute('aria-label') || '') + (b.title || '')));
    if (btn) btn.click();
  });
  await page.waitForTimeout(1000);

  // 面板判定必须看可见性：收起状态下 .dsh-ego-side-root 仍挂载在 DOM 里
  //（betterSidebar 只隐藏不卸载），此时 controller.visible=false，不会拉流。
  const panelVisible = () => page.evaluate(() => {
    const root = document.querySelector('.dsh-ego-side-root');
    return !!root && root.offsetParent !== null;
  });

  // 打开/激活「Agent 浏览器」Tab（若面板不可见）
  if (!(await panelVisible())) {
    // 情况 A：Tab 已开但未激活——点 Tab 头
    await page.evaluate(() => {
      const header = Array.from(document.querySelectorAll('*'))
        .find((el) => el.children.length === 0 && (el.textContent || '').trim() === 'Agent 浏览器');
      if (header) header.click();
    });
    await page.waitForTimeout(1200);
  }
  if (!(await panelVisible())) {
    // 情况 B：Tab 未开——从「新建标签页」菜单里打开
    await page.evaluate(() => {
      const plus = Array.from(document.querySelectorAll('button')).find((b) =>
        /新建标签页/.test((b.textContent || '') + (b.getAttribute('aria-label') || '') + (b.title || '')));
      if (plus) plus.click();
    });
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      const item = Array.from(document.querySelectorAll('*'))
        .find((el) => el.children.length === 0 && (el.textContent || '').trim() === 'Agent 浏览器');
      if (item) item.click();
    });
    await page.waitForTimeout(2000);
  }
  if (!(await panelVisible())) { fail('open-sidebar-tab'); throw new Error('sidebar tab not visible'); }

  // 选中目标页标签
  await page.evaluate(() => {
    const tab = Array.from(document.querySelectorAll('.dsh-ego-side-tab'))
      .find((t) => /example\\.com|Example Domain/.test(t.textContent || ''));
    if (tab) tab.click();
  });
  await page.waitForTimeout(1500);

  // 等待实时画面出现并读取中心坐标 + 徽章文案
  let view = null;
  for (let i = 0; i < 20; i++) {
    view = await page.evaluate(() => {
      const img = document.querySelector('.dsh-ego-side-liveimg');
      if (!img) return null;
      const r = img.getBoundingClientRect();
      const badge = document.querySelector('.dsh-ego-side-livebadge');
      return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, badge: badge ? badge.textContent : '' };
    });
    if (view && view.cx > 0 && view.cy > 0) break;
    await page.waitForTimeout(500);
  }
  if (!view) { fail('no-live-image'); throw new Error('no live image'); }

  // 3. 真实 CDP 点击侧边栏画面中心
  await page.mouse.click(view.cx, view.cy);
  await page.waitForTimeout(800);

  // 4. 读回目标页探针
  await taskSpaces.useOrCreate('ego-smoke-target');
  const probe = await page.evaluate(() => window.__egoSmokeProbe || null);
  console.log('@@SMOKE@@' + JSON.stringify({
    pass: !!(probe && probe.down),
    probe,
    badge: view.badge,
    wiredBadge: /已接管/.test(view.badge || ''),
  }));
} catch (err) {
  console.log('@@SMOKE@@' + JSON.stringify({ pass: false, stage: 'exception', error: String(err && err.message || err) }));
}
`;
}

// ── 执行 ──────────────────────────────────────────────────────────────────
const guiUrl = argValue('--gui-url') || findGuiUrl();
if (!guiUrl) {
  console.error('[smoke] 找不到 DSH GUI 地址。请用 --gui-url "http://127.0.0.1:PORT/?token=..." 显式传入。');
  process.exit(2);
}
if (!existsSync(CLI)) {
  console.error('[smoke] 找不到 ego-browser CLI: ' + CLI);
  process.exit(2);
}

// Windows 上 vendored 运行时用 POSIX 名找不到 Chrome 时需要显式路径
if (!process.env.EGO_LINUX_CHROME && process.platform === 'win32') {
  const candidates = [
    'C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe',
    'C:\\\\Program Files (x86)\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe',
  ];
  for (const c of candidates) if (existsSync(c)) { process.env.EGO_LINUX_CHROME = c; break; }
}

console.log('[smoke] GUI: ' + guiUrl.replace(/token=.*/, 'token=***'));
console.log('[smoke] 驱动 ego-browser 执行侧边栏输入链路测试…');

const child = spawn(process.execPath, [CLI, 'nodejs'], {
  stdio: ['pipe', 'pipe', 'inherit'],
  env: process.env,
});
let out = '';
child.stdout.on('data', (d) => (out += d));
child.on('error', (err) => {
  console.error('[smoke] 无法启动 ego-browser CLI: ' + err.message);
  process.exit(2);
});
child.stdin.write(buildHeredoc(guiUrl));
child.stdin.end();

child.on('close', (code) => {
  const m = out.match(/@@SMOKE@@(\{.*\})/);
  if (!m) {
    console.error('[smoke] 未收到测试结果（CLI exit ' + code + '）。原始输出：\n' + out.slice(-800));
    process.exit(1);
  }
  const result = JSON.parse(m[1]);
  if (result.pass) {
    console.log('[smoke] ✅ PASS — 侧边栏点击已送达目标页面');
    console.log('        probe: ' + JSON.stringify(result.probe));
    console.log('        badge: ' + (result.badge || '').trim());
    if (!result.wiredBadge) console.log('        ⚠️  徽章缺少「已接管」标记——如果这是旧构建，请 pnpm build 后刷新 GUI');
    process.exit(0);
  }
  console.error('[smoke] ❌ FAIL — 侧边栏输入未送达（stage: ' + (result.stage || 'probe') + '）');
  console.error('        详情: ' + JSON.stringify(result));
  process.exit(1);
});
