import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PageMeta, Tag } from '@linkbase/contracts';
import { Plus, Settings, Tag as TagIcon, Trash2 } from 'lucide-react';
import { api, jsonBody } from '@/lib/api';
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
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

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
          {/* 快捷动作 */}
          <CommandGroup heading={t('quickActions')}>
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
                  className="gap-2"
                >
                  <span className="min-w-0 truncate">{hit.title || te('untitled')}</span>
                  {hit.breadcrumb.length > 0 && (
                    <span className="ms-auto min-w-0 truncate text-xs text-muted-foreground">
                      {hit.breadcrumb.map((b) => b.title || te('untitled')).join(' / ')}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
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

/** 设置：弹窗（昵称 + 语言） */
export function SettingsDialog({
  open,
  onOpenChange,
  name,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  onSaved: (name: string) => void;
}) {
  const { t } = useTranslation('workspace');
  const { t: tc } = useTranslation('common');
  const [draft, setDraft] = useState(name);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(name);
      setSaved(false);
    }
  }, [open, name]);

  const save = async () => {
    await api('/users/me', { method: 'PATCH', ...jsonBody({ name: draft }) });
    onSaved(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('settings')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          <div>
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
              {saved && <span className="text-sm text-muted-foreground">{t('nameSaved')}</span>}
            </div>
          </div>
          <div>
            <div className="mb-2 text-sm text-muted-foreground">{tc('language')}</div>
            <LanguageSwitcher />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** 标签聚合视图（T1.5，P0-7）：建标签 / 改色改名 / 删除 / 展开看打标页面 */
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
