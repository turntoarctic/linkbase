import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PageMeta } from '@linkbase/contracts';
import { api, jsonBody } from '@/lib/api';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Button } from '@/components/ui/button';

/** 搜索结果（GET /workspaces/:wsId/search，10 §7） */
interface SearchHit {
  id: string;
  title: string;
  breadcrumb: { id: string; title: string }[];
}

export function SearchView({
  wsId,
  onOpen,
}: {
  wsId: string;
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation('workspace');
  const { t: te } = useTranslation('editor');
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);

  useEffect(() => {
    const query = q.trim();
    if (!query) {
      setHits(null);
      return;
    }
    const timer = setTimeout(() => {
      void api<SearchHit[]>(`/workspaces/${wsId}/search?q=${encodeURIComponent(query)}`)
        .then(setHits)
        .catch(() => setHits([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [q, wsId]);

  return (
    <div className="mx-auto px-8 pb-24" style={{ maxWidth: 'var(--width-content)' }}>
      <h1 className="pt-12 text-4xl font-bold tracking-tight">{t('search')}</h1>
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t('searchPlaceholder')}
        className="mt-8 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
      {hits !== null && (
        <ul className="mt-4">
          {hits.length === 0 && (
            <li className="px-2 py-3 text-sm text-muted-foreground">{t('searchNoResults')}</li>
          )}
          {hits.map((hit) => (
            <li key={hit.id}>
              <button
                type="button"
                onClick={() => onOpen(hit.id)}
                className="w-full rounded-md px-2 py-2 text-left text-sm hover:bg-sidebar-accent"
              >
                <span>{hit.title || te('untitled')}</span>
                {hit.breadcrumb.length > 0 && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {hit.breadcrumb.map((b) => b.title || te('untitled')).join(' / ')}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
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
      <h1 className="pt-12 text-4xl font-bold tracking-tight">{t('trash')}</h1>
      <ul className="mt-8">
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

export function SettingsView({
  name,
  onSaved,
}: {
  name: string;
  onSaved: (name: string) => void;
}) {
  const { t } = useTranslation('workspace');
  const { t: tc } = useTranslation('common');
  const [draft, setDraft] = useState(name);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    await api('/users/me', { method: 'PATCH', ...jsonBody({ name: draft }) });
    onSaved(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="mx-auto px-8 pb-24" style={{ maxWidth: 'var(--width-content)' }}>
      <h1 className="pt-12 text-4xl font-bold tracking-tight">{t('settings')}</h1>
      <div className="mt-8 max-w-96 space-y-6">
        <div>
          <div className="mb-2 text-sm text-muted-foreground">{t('settingsName')}</div>
          <div className="flex items-center gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <Button size="sm" disabled={!draft.trim() || draft === name} onClick={() => void save()}>
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
    </div>
  );
}
