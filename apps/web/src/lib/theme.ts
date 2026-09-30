/**
 * 主题偏好（06 §5.1 token 体系）：light / dark / system，落 localStorage，
 * 以 .dark 类挂在 <html> 上切换整组语义 token（组件零改动）。
 */
export type ThemePref = 'light' | 'dark' | 'system';

const KEY = 'linkbase.theme';
const mq = window.matchMedia?.('(prefers-color-scheme: dark)');

export function getThemePref(): ThemePref {
  const v = localStorage.getItem(KEY);
  return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
}

export function applyTheme(pref: ThemePref): void {
  const dark = pref === 'dark' || (pref === 'system' && (mq?.matches ?? false));
  document.documentElement.classList.toggle('dark', dark);
}

export function setThemePref(pref: ThemePref): void {
  localStorage.setItem(KEY, pref);
  applyTheme(pref);
}

/** 应用启动时调用：恢复偏好 + 跟随系统变化（仅 system 档） */
export function initTheme(): void {
  applyTheme(getThemePref());
  mq?.addEventListener('change', () => {
    if (getThemePref() === 'system') applyTheme('system');
  });
}
