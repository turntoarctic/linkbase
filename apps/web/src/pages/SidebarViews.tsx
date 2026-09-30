import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PageMeta, Tag } from '@linkbase/contracts';
import { Bell, FileText, Info, Moon, Monitor, Palette, Plus, Settings, SlidersHorizontal, Sun, Tag as TagIcon, Trash2, User } from 'lucide-react';
import pkg from '../../package.json';
import { api, jsonBody } from '@/lib/api';
import { getThemePref, setThemePref, type ThemePref } from '@/lib/theme';
import i18n, { supportedLocales, type AppLocale } from '@/i18n';
import { changeLocale } from '@/components/LanguageSwitcher';
import { cn } from '@/lib/cn';
import { TAG_COLORS } from '@/components/page-tags';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
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

/** 搜索结果（GET /workspaces/:wsId/search，10 §7） */
interface SearchHit {
  id: string;
  title: string;
  breadcrumb: { id: string; title: string }[];
}

/** 搜索 + 快捷动作（⌘K 命令面板）：空查询显动作，输入即搜索 */
export function SearchDialog({
  wsId,
  open,
  onOpenChange,
  onOpenPage,
  onCreatePage,
  onOpenTrash,
  onOpenTags,
  onOpenSettings,
}: {
  wsId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenPage: (id: string) => void;
  onCreatePage: () => void;
  onOpenTrash: () => void;
  onOpenTags: () => void;
  onOpenSettings: () => void;
}) {
  const { t } = useTranslation('workspace');
  const { t: te } = useTranslation('editor');
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);

  useEffect(() => {
    if (!open) {
      setQ('');
      setHits([]);
      return;
    }
    const query = q.trim();
    if (!query) {
      setHits([]);
      return;
    }
    const timer = setTimeout(() => {
      void api<SearchHit[]>(`/workspaces/${wsId}/search?q=${encodeURIComponent(query)}`)
        .then(setHits)
        .catch(() => setHits([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [q, wsId, open]);

  const openHit = (id: string) => {
    onOpenPage(id);
    onOpenChange(false);
  };

  const run = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('search')}
      description={t('searchPlaceholder')}
      className="sm:max-w-xl"
    >
      <Command shouldFilter={false}>
        <CommandInput
          autoFocus
          value={q}
          onValueChange={setQ}
          placeholder={t('searchPlaceholder')}
        />
        <CommandList>
          {/* 有查询：命中优先，快捷动作沉底；空查询：仅快捷动作 */}
          {q.trim() && hits.length === 0 && (
            <CommandEmpty>{t('searchNoResults')}</CommandEmpty>
          )}
          {hits.length > 0 && (
            <CommandGroup heading={t('pages')}>
              {hits.map((hit) => (
                <CommandItem
                  key={hit.id}
                  value={hit.id}
                  onSelect={() => openHit(hit.id)}
                  className="gap-2 py-2"
                >
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm">
                      {hit.title || te('untitled')}
                    </span>
                    {hit.breadcrumb.length > 0 && (
                      <span className="truncate text-xs text-muted-foreground">
                        {hit.breadcrumb.map((b) => b.title || te('untitled')).join(' / ')}
                      </span>
                    )}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {/* 快捷动作 */}
          <CommandGroup heading={q.trim() ? undefined : t('quickActions')}>
            <CommandItem value="action:new-page" onSelect={() => run(onCreatePage)} className="gap-2">
              <Plus />
              {t('newPage')}
            </CommandItem>
            <CommandItem value="action:trash" onSelect={() => run(onOpenTrash)} className="gap-2">
              <Trash2 />
              {t('trash')}
            </CommandItem>
            <CommandItem value="action:tags" onSelect={() => run(onOpenTags)} className="gap-2">
              <TagIcon />
              {t('tags')}
            </CommandItem>
            <CommandItem value="action:settings" onSelect={() => run(onOpenSettings)} className="gap-2">
              <Settings />
              {t('settings')}
            </CommandItem>
          </CommandGroup>
          {/* 快捷键提示条 */}
          <div className="flex items-center gap-4 border-t px-3 py-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
              {t('searchHintNav')}
            </span>
            <span className="flex items-center gap-1">
              <Kbd>↵</Kbd>
              {t('searchHintOpen')}
            </span>
            <span className="flex items-center gap-1">
              <Kbd>esc</Kbd>
              {t('searchHintClose')}
            </span>
          </div>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}

/** 快捷键小键帽（搜索弹窗底部提示条用） */
function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border bg-muted px-1 font-sans text-[10px] font-medium text-muted-foreground">
      {children}
    </kbd>
  );
}

interface TrashEntry {
  page: PageMeta;
  path: { id: string; title: string }[];
}

export function TrashView({ wsId, onChanged }: { wsId: string; onChanged: () => void }) {
  const { t } = useTranslation('workspace');
  const { t: tc } = useTranslation('common');
  const { t: te } = useTranslation('editor');
  const [items, setItems] = useState<TrashEntry[] | null>(null);

  const load = useCallback(async () => {
    setItems(await api<TrashEntry[]>(`/workspaces/${wsId}/trash`));
  }, [wsId]);

  useEffect(() => {
    void load().catch(() => setItems([]));
  }, [load]);

  const act = async (id: string, action: 'restore' | 'purge') => {
    if (action === 'restore') {
      await api(`/workspaces/${wsId}/pages/${id}/restore`, { method: 'POST' });
    } else {
      await api(`/workspaces/${wsId}/pages/${id}?permanent=true`, { method: 'DELETE' });
    }
    onChanged();
    void load();
  };

  return (
    <div className="mx-auto px-8 pb-24" style={{ maxWidth: 'var(--width-content)' }}>
      <h1 className="pt-8 text-3xl font-bold tracking-tight">{t('trash')}</h1>
      <ul className="mt-6">
        {items?.length === 0 && (
          <li className="px-2 text-sm text-muted-foreground">{t('trashEmpty')}</li>
        )}
        {items?.map(({ page, path }) => (
          <li
            key={page.id}
            className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-sidebar-accent"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate">{page.title || te('untitled')}</div>
              {path.length > 0 && (
                <div className="truncate text-xs text-muted-foreground">
                  {path.map((p) => p.title || te('untitled')).join(' / ')}
                </div>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={() => void act(page.id, 'restore')}>
              {tc('restore')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive"
              onClick={() => void act(page.id, 'purge')}
            >
              {tc('delete')}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

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

export function TagsDialog({
  wsId,
  open,
  onOpenChange,
  onOpenPage,
}: {
  wsId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenPage: (id: string) => void;
}) {
  const { t } = useTranslation('workspace');
  const { t: tc } = useTranslation('common');
  const { t: te } = useTranslation('editor');
  const [tags, setTags] = useState<Tag[]>([]);
  const [name, setName] = useState('');
  const [color, setColor] = useState<number>(6);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pages, setPages] = useState<PageMeta[]>([]);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  useEffect(() => {
    if (!open) {
      setTags([]);
      setExpanded(null);
      setName('');
      return;
    }
    void api<Tag[]>(`/workspaces/${wsId}/tags`).then(setTags).catch(() => setTags([]));
  }, [open, wsId]);

  const expand = async (tagId: string) => {
    if (expanded === tagId) {
      setExpanded(null);
      return;
    }
    setExpanded(tagId);
    setPages(
      await api<PageMeta[]>(`/workspaces/${wsId}/tags/${tagId}/pages`).catch(() => []),
    );
  };

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const tag = await api<Tag>(`/workspaces/${wsId}/tags`, {
      method: 'POST',
      ...jsonBody({ name: trimmed, color }),
    });
    setName('');
    setTags((ts) => [...ts, tag]);
  };

  const rename = async (tagId: string) => {
    const trimmed = renameDraft.trim();
    if (!trimmed) return;
    const updated = await api<Tag>(`/workspaces/${wsId}/tags/${tagId}`, {
      method: 'PATCH',
      ...jsonBody({ name: trimmed }),
    });
    setTags((ts) => ts.map((x) => (x.id === tagId ? updated : x)));
    setRenameId(null);
  };

  const recolor = async (tagId: string, c: number) => {
    const updated = await api<Tag>(`/workspaces/${wsId}/tags/${tagId}`, {
      method: 'PATCH',
      ...jsonBody({ color: c }),
    });
    setTags((ts) => ts.map((x) => (x.id === tagId ? updated : x)));
  };

  const remove = async (tagId: string) => {
    await api(`/workspaces/${wsId}/tags/${tagId}`, { method: 'DELETE' });
    setTags((ts) => ts.filter((x) => x.id !== tagId));
    if (expanded === tagId) setExpanded(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('tags')}</DialogTitle>
        </DialogHeader>
        {/* 新建：名 + 8 色点 */}
        <div className="flex items-center gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('tagNamePlaceholder')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void create();
            }}
          />
          <div className="flex shrink-0 gap-1">
            {TAG_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={t('tagColor', { n: c })}
                onClick={() => setColor(c)}
                className={`size-3.5 rounded-full ring-offset-1 ${color === c ? 'ring-2 ring-foreground' : ''}`}
                style={{ background: `var(--tag-${c}-fg)` }}
              />
            ))}
          </div>
        </div>
        <ul className="max-h-80 space-y-0.5 overflow-y-auto">
          {tags.length === 0 && <li className="px-2 py-1 text-sm text-muted-foreground">{t('noTags')}</li>}
          {tags.map((tag) => (
            <li key={tag.id} className="rounded-md text-sm">
              <div className="flex items-center gap-2 px-2 py-1.5 hover:bg-sidebar-accent">
                <button
                  type="button"
                  onClick={() => void expand(tag.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-start"
                >
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: `var(--tag-${tag.color}-fg)` }}
                  />
                  {renameId === tag.id ? (
                    <Input
                      autoFocus
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      className="h-6 text-[13px]"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void rename(tag.id);
                        if (e.key === 'Escape') setRenameId(null);
                      }}
                    />
                  ) : (
                    <span className="truncate">{tag.name}</span>
                  )}
                </button>
                {renameId === tag.id ? (
                  <Button variant="ghost" size="sm" className="h-6" onClick={() => void rename(tag.id)}>
                    {tc('save')}
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6"
                      onClick={() => {
                        setRenameId(tag.id);
                        setRenameDraft(tag.name);
                      }}
                    >
                      {t('rename')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-destructive"
                      onClick={() => void remove(tag.id)}
                    >
                      {tc('delete')}
                    </Button>
                  </>
                )}
              </div>
              {expanded === tag.id && (
                <div className="pb-1 pl-6">
                  <div className="flex gap-1 py-1">
                    {TAG_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-label={t('tagColor', { n: c })}
                        onClick={() => void recolor(tag.id, c)}
                        className={`size-3 rounded-full ring-offset-1 ${tag.color === c ? 'ring-2 ring-foreground' : ''}`}
                        style={{ background: `var(--tag-${c}-fg)` }}
                      />
                    ))}
                  </div>
                  {pages.length === 0 && (
                    <div className="px-2 py-1 text-xs text-muted-foreground">{t('tagPagesEmpty')}</div>
                  )}
                  {pages.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        onOpenPage(p.id);
                        onOpenChange(false);
                      }}
                      className="block w-full truncate rounded px-2 py-1 text-start text-[13px] hover:bg-sidebar-accent"
                    >
                      {p.title || te('untitled')}
                    </button>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
