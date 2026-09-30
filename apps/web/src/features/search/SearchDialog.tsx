import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Plus, Settings, Tag as TagIcon, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';

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

