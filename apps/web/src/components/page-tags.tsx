/**
 * 页面打标（T1.5，P0-7）：顶栏 chips + ⌄ 菜单勾选打/去标 + 内联建标签。
 * 标签色只引 tokens（--tag-N-bg/fg，08 §3.5 色板），不裸写色值（06 §5.1）。
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Tag } from '@linkbase/contracts';
import { Plus } from 'lucide-react';
import { api, jsonBody } from '@/lib/api';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export const TAG_COLORS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

/** 标签色 chip（06 §5.1 8 色板 → CSS 变量） */
export function TagChip({ tag }: { tag: Tag }) {
  return (
    <span
      className="rounded-sm px-1.5 py-0.5 text-xs leading-4 font-medium"
      style={{
        background: `var(--tag-${tag.color}-bg)`,
        color: `var(--tag-${tag.color}-fg)`,
      }}
    >
      {tag.name}
    </span>
  );
}

export function PageTags({ wsId, pageId }: {
  wsId: string;
  pageId: string;
}) {
  const { t } = useTranslation('workspace');
  const { t: tc } = useTranslation('common');
  const [all, setAll] = useState<Tag[]>([]);
  const [pageTags, setPageTags] = useState<Tag[]>([]);
  const [name, setName] = useState('');
  const [color, setColor] = useState<number>(6);
  const [open, setOpen] = useState(false);

  const reload = useCallback(async () => {
    const [tags, mine] = await Promise.all([
      api<Tag[]>(`/workspaces/${wsId}/tags`),
      api<Tag[]>(`/workspaces/${wsId}/pages/${pageId}/tags`),
    ]);
    setAll(tags);
    setPageTags(mine);
  }, [wsId, pageId]);

  useEffect(() => {
    setPageTags([]);
    if (open) void reload().catch(() => {});
  }, [open, reload]);

  const toggle = async (tag: Tag) => {
    const has = pageTags.some((p) => p.id === tag.id);
    await api(`/workspaces/${wsId}/pages/${pageId}/tags/${tag.id}`, { method: has ? 'DELETE' : 'PUT' });
    await reload();
  };

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const tag = await api<Tag>(`/workspaces/${wsId}/tags`, {
      method: 'POST',
      ...jsonBody({ name: trimmed, color }),
    });
    setName('');
    await api(`/workspaces/${wsId}/pages/${pageId}/tags/${tag.id}`, { method: 'PUT' });
    await reload();
  };

  return (
    <div className="ml-auto flex items-center gap-1">
      {pageTags.map((tag) => (
        <TagChip key={tag.id} tag={tag} />
      ))}
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon-sm" aria-label={t('tags')} className="text-muted-foreground">
              <Plus />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-56">
          {all.map((tag) => (
            <DropdownMenuCheckboxItem
              key={tag.id}
              checked={pageTags.some((p) => p.id === tag.id)}
              onClick={(e) => {
                e.preventDefault(); // 勾选后保持菜单开启，可连续操作
                void toggle(tag);
              }}
              closeOnClick={false}
            >
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ background: `var(--tag-${tag.color}-fg)` }}
              />
              <span className="truncate">{tag.name}</span>
            </DropdownMenuCheckboxItem>
          ))}
          {all.length > 0 && <DropdownMenuSeparator />}
          <div className="px-1.5 py-1" onKeyDown={(e) => e.stopPropagation()}>
            <div className="flex gap-1">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('tagNamePlaceholder')}
                className="h-7 text-[13px]"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void create();
                }}
              />
              <Button variant="secondary" size="sm" className="h-7" onClick={() => void create()} disabled={!name.trim()}>
                {tc('save')}
              </Button>
            </div>
            <div className="mt-1.5 flex gap-1.5 px-0.5">
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
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
