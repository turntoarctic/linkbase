import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PageMeta } from '@linkbase/contracts';
import { Search } from 'lucide-react';
import { api, jsonBody } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

/** 搜索结果（GET /workspaces/:wsId/search，10 §7） */
interface SearchHit {
  id: string;
  title: string;
  breadcrumb: { id: string; title: string }[];
}

/** 搜索：⌘K 命令面板式弹窗（非页面），回车/点击直达页面 */
export function SearchDialog({
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 p-0 sm:max-w-xl" showCloseButton={false}>
        <DialogHeader className="sr-only">
          <DialogTitle>{t('search')}</DialogTitle>
          <DialogDescription>{t('searchPlaceholder')}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="border-0 shadow-none focus-visible:ring-0"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && hits[0]) openHit(hits[0].id);
            }}
          />
        </div>
        <ul className="max-h-80 overflow-y-auto p-1.5">
          {q.trim() && hits.length === 0 && (
            <li className="px-2 py-3 text-sm text-muted-foreground">{t('searchNoResults')}</li>
          )}
          {hits.map((hit) => (
            <li key={hit.id}>
              <button
                type="button"
                onClick={() => openHit(hit.id)}
                className="w-full rounded-md px-2 py-2 text-left text-sm hover:bg-sidebar-accent"
              >
                <span>{hit.title || te('untitled')}</span>
                {hit.breadcrumb.length > 0 && (
                  <span className="ms-2 text-xs text-muted-foreground">
                    {hit.breadcrumb.map((b) => b.title || te('untitled')).join(' / ')}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
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
