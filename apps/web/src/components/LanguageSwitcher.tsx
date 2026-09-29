import { useTranslation } from 'react-i18next';
import { api, jsonBody } from '@/lib/api';
import i18n, { supportedLocales, syncDocumentLang, type AppLocale } from '@/i18n';
import { useAuthStore } from '@/stores/auth';

const localeLabel = (lng: string): string => {
  try {
    // 自名（native name）是数据不是文案：zh-CN → “中文”，en → “English”
    return new Intl.DisplayNames([lng], { type: 'language' }).of(lng) ?? lng;
  } catch {
    return lng;
  }
};

/** 语言切换（13 §6）：即时生效、写 localStorage、登录态落库 users.locale */
export function changeLocale(locale: AppLocale): void {
  void (async () => {
    await i18n.changeLanguage(locale);
    localStorage.setItem('linkbase.locale', locale);
    syncDocumentLang(locale);
    if (useAuthStore.getState().user) {
      // 失败只告警，不影响本地切换（13 §6）
      await api('/users/me', { method: 'PATCH', ...jsonBody({ locale }) }).catch(() => undefined);
    }
  })();
}

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation('common');
  const current = (i18n.resolvedLanguage ?? 'zh-CN') as AppLocale;
  return (
    <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <span>{t('language')}</span>
      <select
        aria-label={t('language')}
        value={current}
        onChange={(e) => changeLocale(e.target.value as AppLocale)}
        className="rounded border border-input bg-background px-1.5 py-1 text-sm"
      >
        {supportedLocales.map((lng) => (
          <option key={lng} value={lng}>
            {localeLabel(lng)}
          </option>
        ))}
      </select>
    </label>
  );
}
