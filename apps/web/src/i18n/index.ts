import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import zhCN from './locales/zh-CN.json';
import en from './locales/en.json';

/**
 * i18next 初始化（13 §3）：
 * - 探测/持久化：localStorage('linkbase.locale') → navigator → 兜底 zh-CN；
 * - 登录后语言随 users.locale（AppShell 挂载时同步），切换写回 localStorage + PATCH /users/me；
 * - 命名空间：common / auth / workspace / editor / errors（错误按 LB_* code 映射，10 §6）。
 */
export const namespaces = ['common', 'auth', 'workspace', 'editor', 'errors'] as const;
export const supportedLocales = ['zh-CN', 'en'] as const;
export type AppLocale = (typeof supportedLocales)[number];

export const defaultLocale: AppLocale = 'zh-CN';

export function normalizeLocale(input: string | null | undefined): AppLocale {
  if (!input) return defaultLocale;
  if (input === 'zh-CN' || input === 'zh' || input.startsWith('zh')) return 'zh-CN';
  if (input === 'en' || input.startsWith('en')) return 'en';
  return defaultLocale;
}

const detector = new LanguageDetector();
detector.init({
  order: ['localStorage', 'navigator'],
  lookupLocalStorage: 'linkbase.locale',
  caches: ['localStorage'],
});

void i18n.use(detector).use(initReactI18next).init({
  resources: {
    'zh-CN': zhCN,
    en,
  },
  ns: [...namespaces],
  defaultNS: 'common',
  fallbackLng: defaultLocale,
  supportedLngs: [...supportedLocales],
  // 注意：不要设 load: 'languageOnly'——资源键是区域全码（zh-CN），region 剥离会让 t() 查不到（回归已踩）
  interpolation: { escapeValue: false },
  returnNull: false,
});

/** <html lang> 同步（无障碍与字体回退，13 §3） */
export function syncDocumentLang(locale: string): void {
  document.documentElement.lang = locale;
}

export default i18n;
