/**
 * 页面树行（shadcn sidebar-07 组合式）：行选中、箭头折叠、+/⋯ hover 操作、拖拽换序/换父（T1.3）。
 * 编辑器插件/树行为的扩展点：行操作加在 TreeItem，schema 类扩展在 features/editor/schema.ts。
 */
import { useRef, useState, type DragEvent as ReactDragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { PageTreeNode } from '@linkbase/contracts';
import { ChevronRight, MoreHorizontal, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import {
  Collapsible,
  CollapsibleContent,
} from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  useSidebar,
} from '@/components/ui/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/** 常用页面图标（P0-3 直选集，patchPage.icon 上限 64 字符） */
export const PAGE_ICONS = [
  '📄', '📝', '📁', '🗂', '📊', '📈', '📋', '📌',
  '🧠', '💡', '🔥', '⭐', '🚀', '🛠', '⚙', '🧪',
  '🐛', '📦', '🗓', '✅', '❗', '🎯', '📚', '🔗',
  '💬', '🧩', '🎨', '💻', '🔍', '🏷', '🌱', '🧭',
] as const;

/** 目标是否在 node 子树内（拖拽环守卫 / 删除回退判断） */
export function subtreeHas(node: PageTreeNode, id: string): boolean {
  if (node.id === id) return true;
  return node.children.some((c) => subtreeHas(c, id));
}

export interface MoveInput {
  parentId: string | null;
  afterId: string | null;
}

/** 页面树行（shadcn sidebar-07 组合式：行选中、箭头折叠、⋯ 菜单、拖拽换序/换父 T1.3） */
export function TreeItem({
  node,
  siblings,
  selectedId,
  favoriteIds,
  onSelect,
  onAddChild,
  onRename,
  onTrash,
  onToggleFavorite,
  onMove,
}: {
  node: PageTreeNode;
  siblings: PageTreeNode[];
  selectedId: string | null;
  favoriteIds: Set<string>;
  onSelect: (node: PageTreeNode) => void;
  onAddChild: (node: PageTreeNode) => void;
  onRename: (node: PageTreeNode) => void;
  onTrash: (node: PageTreeNode) => void;
  onToggleFavorite: (node: PageTreeNode) => void;
  onMove: (node: PageTreeNode, input: MoveInput) => void;
}) {
  const { t } = useTranslation('editor');
  const { t: tw } = useTranslation('workspace');
  const [open, setOpen] = useState(false);
  // 拖拽落点指示：before/after = 上/下缘内描边；into = 底色（移入为子页）
  const [zone, setZone] = useState<'before' | 'after' | 'into' | null>(null);
  const favorite = favoriteIds.has(node.id);
  const hasChildren = node.children.length > 0;
  const title = node.title || t('untitled');
  const idx = siblings.findIndex((s) => s.id === node.id);

  const zoneOf = (e: ReactDragEvent): 'before' | 'after' | 'into' => {
    const r = e.currentTarget.getBoundingClientRect();
    const y = (e.clientY - r.top) / r.height;
    return y < 0.3 ? 'before' : y > 0.7 ? 'after' : 'into';
  };

  const handleDrop = (e: ReactDragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const srcId = e.dataTransfer.getData('application/x-linkbase-page');
    const z = zone ?? zoneOf(e);
    setZone(null);
    if (!srcId || srcId === node.id) return;
    const src = siblings.find((s) => s.id === srcId);
    if (src && z === 'into' && subtreeHas(src, node.id)) return; // 不能拖进自己子树
    if (z === 'into') {
      onMove(node, { parentId: node.id, afterId: null });
    } else {
      onMove(node, {
        parentId: node.parentId,
        afterId: z === 'after' ? node.id : (idx > 0 ? siblings[idx - 1]!.id : null),
      });
    }
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="group/collapsible">
      <SidebarMenuItem className="mt-0.5">
        <SidebarMenuButton
          tooltip={title}
          isActive={selectedId === node.id}
          onClick={() => onSelect(node)}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('application/x-linkbase-page', node.id);
            e.dataTransfer.effectAllowed = 'move';
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';
            setZone(zoneOf(e));
          }}
          onDragLeave={(e) => {
            e.stopPropagation();
            setZone(null);
          }}
          onDrop={handleDrop}
          onDragEnd={() => setZone(null)}
          className={cn(
            'text-[13px]',
            zone === 'before' && 'shadow-[inset_0_2px_0_0_var(--sidebar-primary)]',
            zone === 'after' && 'shadow-[inset_0_-2px_0_0_var(--sidebar-primary)]',
            zone === 'into' && 'bg-sidebar-accent ring-2 ring-sidebar-primary ring-inset',
          )}
        >
          {/* Notion 式：hover 时 📄 换成折叠箭头（按开合状态旋转）；叶子保持 📄 */}
          {hasChildren ? (
            <>
              <span aria-hidden className="group-hover/menu-button:hidden">
                {node.icon ?? '📄'}
              </span>
              <span
                role="button"
                tabIndex={0}
                aria-label={open ? tw('collapse') : tw('expand')}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen((o) => !o);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    setOpen((o) => !o);
                  }
                }}
                className="hidden size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground group-hover/menu-button:flex hover:text-foreground"
              >
                <ChevronRight className={cn("size-3.5 transition-transform duration-200", open && "rotate-90")} />
              </span>
            </>
          ) : (
            <span aria-hidden>{node.icon ?? '📄'}</span>
          )}
          <span className="truncate">{title}</span>
        </SidebarMenuButton>
        {/* + 建子页（hover 显示，位于 ⋯ 左侧） */}
        <Tooltip>
          <TooltipTrigger
            render={
              <SidebarMenuAction
                showOnHover
                className="right-7 cursor-pointer"
                aria-label={tw('addChildPage')}
                onClick={() => {
                  setOpen(true);
                  onAddChild(node);
                }}
              >
                <Plus />
              </SidebarMenuAction>
            }
          />
          <TooltipContent side="bottom">{tw('addChildPage')}</TooltipContent>
        </Tooltip>
        {/* ⋯ 菜单：建子页 / 重命名 / 收藏 / 移入回收站 */}
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger
              render={
                <DropdownMenuTrigger render={<SidebarMenuAction showOnHover aria-label={tw('moreActions')} />}>
                  <MoreHorizontal />
                </DropdownMenuTrigger>
              }
            />
            <TooltipContent side="bottom">{tw('moreActions')}</TooltipContent>
          </Tooltip>
          <DropdownMenuContent side="right" align="start" className="w-44">
            <DropdownMenuItem
              onClick={() => {
                setOpen(true);
                onAddChild(node);
              }}
            >
              <Plus />
              {tw('addChildPage')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onRename(node)}>
              <Pencil />
              {tw('rename')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onToggleFavorite(node)} closeOnClick={false}>
              <Star />
              {favorite ? tw('unfavorite') : tw('favorite')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => onTrash(node)}>
              <Trash2 />
              {tw('moveToTrash')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {hasChildren && (
          <CollapsibleContent>
            <SidebarMenuSub>
              {node.children.map((child) => (
                <TreeItem
                  key={child.id}
                  node={child}
                  siblings={node.children}
                  selectedId={selectedId}
                  favoriteIds={favoriteIds}
                  onSelect={onSelect}
                  onAddChild={onAddChild}
                  onRename={onRename}
                  onTrash={onTrash}
                  onToggleFavorite={onToggleFavorite}
                  onMove={onMove}
                />
              ))}
            </SidebarMenuSub>
          </CollapsibleContent>
        )}
      </SidebarMenuItem>
    </Collapsible>
  );
}

/** 侧栏右缘把手：拖拽调宽（208–480）、单击折叠、双击复位 240 */

/**
 * Phase 0 壳（06 §5.4 骨架）：shadcn sidebar-07 组合式——
 * 头部空间下拉 / 快捷入口 + 页面树 / 底部设置与新页面；icon 折叠 + 拖拽调宽。
 */
