import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PageMeta, Tag } from '@linkbase/contracts';
import { api, jsonBody } from '@/lib/api';
import { TAG_COLORS } from '@/components/page-tags';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

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
