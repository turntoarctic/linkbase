import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PageMeta } from '@linkbase/contracts';
import { api, jsonBody } from '@/lib/api';
import { Button } from '@/components/ui/button';

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

