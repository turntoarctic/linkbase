import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell, Info, Moon, Monitor, Palette, SlidersHorizontal, Sun, User } from 'lucide-react';
import { api, jsonBody } from '@/lib/api';
import { getThemePref, setThemePref, type ThemePref } from '@/lib/theme';
import i18n, { supportedLocales, type AppLocale } from '@/i18n';
import { changeLocale } from '@/components/LanguageSwitcher';
import { cn } from '@/lib/cn';
import pkg from '../../../package.json';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from '@/components/ui/sidebar';

/** 设置分区（左导航右面板） */
type SettingsSection = 'account' | 'theme' | 'preferences' | 'notifications' | 'about';

/** 设置弹窗：左侧分区导航 + 右侧面板 */
export function SettingsDialog({
  open,
  onOpenChange,
  name,
  email,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  email?: string;
  onSaved: (name: string) => void;
}) {
  const { t } = useTranslation('workspace');
  const { t: tc } = useTranslation('common');
  const [section, setSection] = useState<SettingsSection>('account');
  const [theme, setTheme] = useState<ThemePref>(() => getThemePref());
  const [draft, setDraft] = useState(name);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (open) {
      setSection('account');
      setDraft(name);
      setSaved(false);
      setTheme(getThemePref());
    }
  }, [open, name]);

  const save = async () => {
    await api('/users/me', { method: 'PATCH', ...jsonBody({ name: draft }) });
    onSaved(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const localeLabel = (lng: string) => {
    try {
      return new Intl.DisplayNames([lng], { type: 'language' }).of(lng) ?? lng;
    } catch {
      return lng;
    }
  };

  const themeOptions: { value: ThemePref; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: t('themeLight'), icon: Sun },
    { value: 'dark', label: t('themeDark'), icon: Moon },
    { value: 'system', label: t('themeSystem'), icon: Monitor },
  ];

  const sections: { id: SettingsSection; label: string; icon: typeof Sun }[] = [
    { id: 'account', label: t('settingsAccount'), icon: User },
    { id: 'theme', label: t('settingsTheme'), icon: Palette },
    { id: 'preferences', label: t('settingsPreferences'), icon: SlidersHorizontal },
    { id: 'notifications', label: t('settingsNotifications'), icon: Bell },
    { id: 'about', label: t('settingsAbout'), icon: Info },
  ];


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 md:max-h-[540px] md:max-w-[700px] lg:max-w-[860px]">
        <DialogTitle className="sr-only">{t('settings')}</DialogTitle>
        <DialogDescription className="sr-only">{t('searchPlaceholder')}</DialogDescription>
        <SidebarProvider className="items-start">
          <Sidebar collapsible="none" className="hidden md:flex">
            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {sections.map(({ id, label, icon: Icon }) => (
                      <SidebarMenuItem key={id}>
                        <SidebarMenuButton isActive={section === id} onClick={() => setSection(id)}>
                          <Icon />
                          <span>{label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
          </Sidebar>
          <main className="flex h-[490px] flex-1 flex-col overflow-hidden">
            <header className="flex h-12 shrink-0 items-center px-6">
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>{t('settings')}</BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>
                      {sections.find((sec) => sec.id === section)?.label}
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </header>
            <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-6 pt-2">
              {section === 'account' && (
                <div className="space-y-4">
                  <div className="rounded-lg bg-secondary p-4">
                    <div className="mb-2 text-sm text-muted-foreground">{t('settingsEmail')}</div>
                    <div className="truncate text-sm">{email || '—'}</div>
                  </div>
                  <div className="rounded-lg bg-secondary p-4">
                    <div className="mb-2 text-sm text-muted-foreground">{t('settingsName')}</div>
                    <div className="flex items-center gap-2">
                      <Input value={draft} onChange={(e) => setDraft(e.target.value)} />
                      <Button
                        size="sm"
                        disabled={!draft.trim() || draft === name}
                        onClick={() => void save()}
                      >
                        {tc('save')}
                      </Button>
                      {saved && (
                        <span className="text-sm text-muted-foreground">{t('nameSaved')}</span>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {section === 'theme' && (
                <div className="rounded-lg bg-secondary p-4">
                  <div className="mb-2 text-sm text-muted-foreground">{t('settingsTheme')}</div>
                  <div className="flex gap-1">
                    {themeOptions.map(({ value, label, icon: Icon }) => (
                      <Button
                        key={value}
                        variant="outline"
                        size="sm"
                        aria-pressed={theme === value}
                        className={cn(
                          'flex-1 gap-1.5',
                          theme === value && 'border-primary bg-accent text-accent-foreground',
                        )}
                        onClick={() => {
                          setTheme(value);
                          setThemePref(value);
                        }}
                      >
                        <Icon className="size-3.5" />
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              {section === 'preferences' && (
                <div className="rounded-lg bg-secondary p-4">
                  <div className="mb-2 text-sm text-muted-foreground">{tc('language')}</div>
                  <div className="flex gap-1">
                    {supportedLocales.map((lng) => (
                      <Button
                        key={lng}
                        variant="outline"
                        size="sm"
                        aria-pressed={i18n.resolvedLanguage === lng}
                        className={cn(
                          'flex-1',
                          i18n.resolvedLanguage === lng &&
                            'border-primary bg-accent text-accent-foreground',
                        )}
                        onClick={() => void changeLocale(lng as AppLocale)}
                      >
                        {localeLabel(lng)}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              {section === 'notifications' && (
                <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                  {t('notificationsComingSoon')}
                </div>
              )}
              {section === 'about' && (
                <div className="space-y-4 text-sm">
                  <div className="rounded-lg bg-secondary p-4">
                    <div className="mb-1 text-sm text-muted-foreground">{t('aboutVersion')}</div>
                    <div>Linkbase v{pkg.version}</div>
                  </div>
                  <div className="rounded-lg bg-secondary p-4">
                    <div className="mb-1 text-sm text-muted-foreground">BlockNote</div>
                    <div>
                      v{pkg.dependencies['@blocknote/core']} ·{' '}
                      <a
                        href="https://www.blocknotejs.org/docs"
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline"
                      >
                        blocknotejs.org/docs
                      </a>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </main>
        </SidebarProvider>
      </DialogContent>
    </Dialog>
  );
}

