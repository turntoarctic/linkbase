import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent as ReactDragEvent } from 'react';
import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import type { PageMeta, PageTreeNode } from '@linkbase/contracts';
import type { EditorBlock } from '@/features/editor/schema';
import { ChevronDown, ChevronRight, LogOut, MoreHorizontal, Pencil, Plus, Search, Settings, Star, Tag as TagIcon, Trash2, X } from 'lucide-react';
import { api, jsonBody } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/stores/auth';
import i18n, { syncDocumentLang, supportedLocales, type AppLocale } from '@/i18n';
import { changeLocale } from '@/components/LanguageSwitcher';
import { PageTags } from '@/components/page-tags';
import {
  Collapsible,
  CollapsibleContent,
} from '@/components/ui/collapsible';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SearchDialog, SettingsDialog, TagsDialog, TrashView } from './SidebarViews';

// BlockSuite 体量大，懒加载不进首屏包
const EditorView = lazy(() =>
  import('@/features/editor/editor-view').then((m) => ({ default: m.EditorView })),
);

interface Me {
  user: { id: string; name: string; locale: 'zh-CN' | 'en' | null };
  workspaces: { id: string; name: string; role: string }[];
}

/** 根→目标路径（面包屑用） */
function findPath(tree: PageTreeNode[], id: string): PageTreeNode[] {
  for (const node of tree) {
    if (node.id === id) return [node];
    const sub = findPath(node.children, id);
    if (sub.length > 0) return [node, ...sub];
  }
  return [];
}

/** 目标是否在 node 子树内（拖拽环守卫） */
function subtreeHas(node: PageTreeNode, id: string): boolean {
  if (node.id === id) return true;
  return node.children.some((c) => subtreeHas(c, id));
}

interface MoveInput {
  parentId: string | null;
  afterId: string | null;
}

/** 常用页面图标（P0-3 直选集，patchPage.icon 上限 64 字符） */
const PAGE_ICONS = [
  '📄', '📝', '📁', '🗂', '📊', '📈', '📋', '📌',
  '🧠', '💡', '🔥', '⭐', '🚀', '🛠', '⚙', '🧪',
  '🐛', '📦', '🗓', '✅', '❗', '🎯', '📚', '🔗',
  '💬', '🧩', '🎨', '💻', '🔍', '🏷', '🌱', '🧭',
] as const;

/** 页面树行（shadcn sidebar-07 组合式：行选中、箭头折叠、⋯ 菜单、拖拽换序/换父 T1.3） */
function TreeItem({
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
      <SidebarMenuItem className="my-1">
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
                <ChevronRight className="size-3.5 transition-transform duration-200 group-data-[open]/collapsible:rotate-90" />
              </span>
            </>
          ) : (
            <span aria-hidden>{node.icon ?? '📄'}</span>
          )}
          <span className="truncate">{title}</span>
        </SidebarMenuButton>
        {/* ⋯ 菜单：建子页 / 重命名 / 收藏 / 移入回收站 */}
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuAction showOnHover />}>
            <MoreHorizontal />
          </DropdownMenuTrigger>
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
function SidebarResizeHandle({
  width,
  onWidth,
  onDragging,
}: {
  width: number;
  onWidth: (w: number) => void;
  onDragging: (d: boolean) => void;
}) {
  const { toggleSidebar, setOpen, state } = useSidebar();
  const dragged = useRef(false);
  return (
    <div
      aria-hidden
      onDoubleClick={() => onWidth(240)}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        dragged.current = false;
        const startX = e.clientX;
        const move = (ev: PointerEvent) => {
          const dx = ev.clientX - startX;
          if (!dragged.current && Math.abs(dx) > 2) {
            dragged.current = true;
            onDragging(true);
          }
          if (dragged.current) {
            if (state === 'collapsed' && dx > 20) setOpen(true);
            onWidth(Math.min(480, Math.max(208, width + dx)));
          }
        };
        const up = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          onDragging(false);
          if (!dragged.current) toggleSidebar();
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      }}
      className="absolute inset-y-0 -right-1 z-20 w-2 cursor-col-resize hover:bg-sidebar-border/60"
    />
  );
}

/**
 * Phase 0 壳（06 §5.4 骨架）：shadcn sidebar-07 组合式——
 * 头部空间下拉 / 快捷入口 + 页面树 / 底部设置与新页面；icon 折叠 + 拖拽调宽。
 */
export function AppShell() {
  const { t } = useTranslation('workspace');
  const { t: tc } = useTranslation('common');
  const { t: te } = useTranslation('editor');
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const { pageId } = useParams();
  const [me, setMe] = useState<Me | null>(null);
  const [wsId, setWsId] = useState<string | null>(null);
  const [tree, setTree] = useState<PageTreeNode[]>([]);
  const [favorites, setFavorites] = useState<PageMeta[]>([]);
  const [renameNode, setRenameNode] = useState<PageTreeNode | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  // 当前页由 URL（/:pageId）驱动，刷新/直达可恢复；showTrash 是唯一非页视图
  const [selected, setSelected] = useState<PageTreeNode | null>(null);
  const [showTrash, setShowTrash] = useState(false);
  const [dialog, setDialog] = useState<'search' | 'settings' | 'tags' | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 侧栏宽度可拖拽（208–480，双击复位 240），持久化 localStorage
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const n = Number(localStorage.getItem('linkbase.sidebarWidth'));
    return n >= 208 && n <= 480 ? n : 240;
  });
  const [draggingSidebar, setDraggingSidebar] = useState(false);

  useEffect(() => {
    localStorage.setItem('linkbase.sidebarWidth', String(sidebarWidth));
  }, [sidebarWidth]);

  const user = useAuthStore((s) => s.user);

  // 登录后语言随 users.locale（13 §6）：服务端有值则覆盖本地
  useEffect(() => {
    if (user?.locale) {
      syncDocumentLang(user.locale);
      void i18n.changeLanguage(user.locale);
    }
  }, [user?.locale]);

  const loadTree = useCallback(async (workspaceId: string) => {
    const tree = await api<PageTreeNode[]>(`/workspaces/${workspaceId}/pages`);
    setTree(tree);
  }, []);

  const loadFavorites = useCallback(async (workspaceId: string) => {
    setFavorites(await api<PageMeta[]>(`/workspaces/${workspaceId}/favorites`).catch(() => []));
  }, []);

  const favoriteIds = useMemo(() => new Set(favorites.map((f) => f.id)), [favorites]);

  // URL → 页面：树上找得到就用树节点（含面包屑），找不到（深层未展开/直达链接）拉单页元数据
  useEffect(() => {
    if (!wsId || !pageId || showTrash) return;
    const hit = findPath(tree, pageId).at(-1);
    if (hit) {
      setSelected(hit);
      return;
    }
    let alive = true;
    void api<PageMeta>(`/workspaces/${wsId}/pages/${pageId}`)
      .then((p) => alive && setSelected({ ...p, children: [] }))
      .catch(() => alive && setSelected(null));
    return () => {
      alive = false;
    };
  }, [wsId, pageId, tree, showTrash]);

  // ⌘K 唤起搜索弹窗
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setDialog('search');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 编辑器：选中页 → GET 文档 JSON（BlockNote 块数组，05 §2）
  const [docData, setDocData] = useState<EditorBlock[] | null>(null);
  useEffect(() => {
    if (!wsId || !selected || showTrash) {
      setDocData(null);
      return;
    }
    let alive = true;
    void api<EditorBlock[]>(`/workspaces/${wsId}/pages/${selected.id}/doc`)
      .then((data) => {
        if (alive) setDocData(data);
      })
      .catch(() => {
        // 404 = 空页 → 空文档起编辑
        if (alive) setDocData([]);
      });
    return () => {
      alive = false;
    };
  }, [wsId, selected, showTrash]);

  useEffect(() => {
    void (async () => {
      try {
        const me = await api<Me>('/auth/me');
        setMe(me);
        let workspace: Me['workspaces'][number] | undefined = me.workspaces[0];
        if (!workspace) {
          const created = await api<{ id: string; name: string }>('/workspaces', {
            method: 'POST',
            ...jsonBody({ name: tc('defaultWorkspaceName', { name: me.user.name }) }),
          });
          workspace = { ...created, role: 'owner' };
        }
        setWsId(workspace.id);
        await loadTree(workspace.id);
        void loadFavorites(workspace.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadTree]);

  const createPage = async (parentId?: string) => {
    if (!wsId) return;
    const page = await api<PageTreeNode>(`/workspaces/${wsId}/pages`, {
      method: 'POST',
      ...jsonBody({ title: '', ...(parentId ? { parentId } : {}) }),
    });
    await loadTree(wsId);
    setShowTrash(false);
    navigate(`/${page.id}`);
  };

  /** 拖拽换序/换父（T1.3） */
  const movePage = async (input: MoveInput & { pageId: string }) => {
    if (!wsId) return;
    await api(`/workspaces/${wsId}/pages/${input.pageId}/move`, {
      method: 'POST',
      ...jsonBody({ parentId: input.parentId, afterId: input.afterId }),
    });
    await loadTree(wsId);
  };

  const toggleFavorite = async (id: string) => {
    if (!wsId) return;
    const has = favoriteIds.has(id);
    await api(`/workspaces/${wsId}/pages/${id}/favorite`, { method: has ? 'DELETE' : 'PUT' });
    await loadFavorites(wsId);
  };

  const trashPage = async (node: PageTreeNode) => {
    if (!wsId) return;
    await api(`/workspaces/${wsId}/pages/${node.id}`, { method: 'DELETE' });
    // 若删的是当前页（或其祖先），回空选择
    if (pageId && subtreeHas(node, pageId)) navigate('/');
    await loadTree(wsId);
    void loadFavorites(wsId);
  };

  const setIcon = async (icon: string | null) => {
    if (!wsId || !renameNode) return;
    await api(`/workspaces/${wsId}/pages/${renameNode.id}`, {
      method: 'PATCH',
      ...jsonBody({ icon }),
    });
    setRenameNode({ ...renameNode, icon });
    await loadTree(wsId);
    void loadFavorites(wsId);
  };

  const renamePage = async () => {
    if (!wsId || !renameNode || !renameDraft.trim()) return;
    const title = renameDraft.trim();
    await api(`/workspaces/${wsId}/pages/${renameNode.id}`, {
      method: 'PATCH',
      ...jsonBody({ title }),
    });
    setRenameNode(null);
    await loadTree(wsId);
    void loadFavorites(wsId);
  };

  /** 打开页面：写 URL + 退出回收站视图（修复点树回不去页面的 bug） */
  const openPage = (node: PageTreeNode) => {
    setShowTrash(false);
    navigate(`/${node.id}`);
  };

  const openPageId = (id: string) => {
    setShowTrash(false);
    navigate(`/${id}`);
  };

  const logout = () => {
    useAuthStore.getState().clear();
    void navigate('/login');
  };

  const workspaceName = me?.workspaces[0]?.name;
  const breadcrumb = useMemo(
    () => (selected ? findPath(tree, selected.id) : []),
    [tree, selected],
  );
  const currentLocale = (i18n.resolvedLanguage ?? 'zh-CN') as AppLocale;

  return (
    <SidebarProvider
      defaultOpen={!document.cookie.includes('sidebar_state=false')}
      style={{ '--sidebar-width': `${sidebarWidth}px` } as CSSProperties}
      className={draggingSidebar ? '[&_div]:transition-none' : undefined}
    >
      <Sidebar collapsible="icon">
        {/* 空间头部（Notion：头像方块 + 名 + 下拉菜单） */}
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger render={<SidebarMenuButton size="lg" />}>
                  <span className="flex size-7 shrink-0 items-center justify-center rounded bg-sidebar-accent text-[12px] font-semibold text-sidebar-accent-foreground">
                    {(workspaceName ?? 'L').trim().charAt(0).toUpperCase()}
                  </span>
                  <span className="truncate font-medium">{workspaceName ?? 'Linkbase'}</span>
                  <ChevronDown className="ms-auto size-3.5 shrink-0 text-muted-foreground" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>{tc('language')}</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      {supportedLocales.map((lng) => (
                        <DropdownMenuItem
                          key={lng}
                          onClick={() => changeLocale(lng)}
                          closeOnClick={false}
                        >
                          {new Intl.DisplayNames([lng], { type: 'language' }).of(lng)}
                          {currentLocale === lng && (
                            <span className="ms-auto text-muted-foreground">✓</span>
                          )}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={logout}>
                    <LogOut />
                    {tc('logout')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          {/* 快捷入口（06 §5.4）：搜索/回收站/设置/新建页；搜索与设置是弹窗 */}
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem className="mt-1">
                  <SidebarMenuButton tooltip={t('search')} onClick={() => setDialog('search')}>
                    <Search />
                    <span>{t('search')}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem className="mt-1">
                  <SidebarMenuButton
                    tooltip={t('trash')}
                    isActive={showTrash}
                    onClick={() => setShowTrash(true)}
                  >
                    <Trash2 />
                    <span>{t('trash')}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem className="mt-1">
                  <SidebarMenuButton tooltip={t('tags')} onClick={() => setDialog('tags')}>
                    <TagIcon />
                    <span>{t('tags')}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem className="mt-1">
                  <SidebarMenuButton
                    tooltip={tc('settings')}
                    onClick={() => setDialog('settings')}
                  >
                    <Settings />
                    <span>{tc('settings')}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem className="mt-1">
                  <SidebarMenuButton tooltip={t('newPage')} onClick={() => void createPage()}>
                    <Plus />
                    <span>{t('newPage')}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {/* 收藏区（T1.5，P0-8） */}
          {favorites.length > 0 && (
            <SidebarGroup>
              <SidebarGroupLabel>{t('favorites')}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {favorites.map((f) => (
                    <SidebarMenuItem key={f.id}>
                      <SidebarMenuButton
                        tooltip={f.title || te('untitled')}
                        isActive={!showTrash && pageId === f.id}
                        onClick={() => openPageId(f.id)}
                        className="text-[13px]"
                      >
                        <span aria-hidden>{f.icon ?? '📄'}</span>
                        <span className="truncate">{f.title || te('untitled')}</span>
                      </SidebarMenuButton>
                      <SidebarMenuAction
                        showOnHover
                        onClick={() => wsId && void toggleFavorite(f.id)}
                        title={t('unfavorite')}
                      >
                        <X />
                      </SidebarMenuAction>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}

          {/* 页面树 */}
          <SidebarGroup>
            <SidebarGroupLabel>{t('pages')}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {tree.map((node) => (
                  <TreeItem
                    key={node.id}
                    node={node}
                    siblings={tree}
                    selectedId={showTrash ? null : (pageId ?? null)}
                    favoriteIds={favoriteIds}
                    onSelect={openPage}
                    onAddChild={(n) => void createPage(n.id)}
                    onRename={(n) => {
                      setRenameNode(n);
                      setRenameDraft(n.title);
                    }}
                    onTrash={(n) => void trashPage(n)}
                    onToggleFavorite={(n) => void toggleFavorite(n.id)}
                    onMove={(n, input) => void movePage({ ...input, pageId: n.id }).catch(() => {})}
                  />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarResizeHandle
          width={sidebarWidth}
          onWidth={setSidebarWidth}
          onDragging={setDraggingSidebar}
        />
      </Sidebar>

      <SidebarInset className="scrollbar-thin h-svh overflow-y-auto">
        {/* 顶栏：折叠开关 + 面包屑（06 §5.4 多级子页路径，可点击跳转）+ 页面打标（T1.5） */}
        <div className="sticky top-0 z-10 flex items-center gap-2 bg-background/80 px-3 py-2 backdrop-blur">
          <SidebarTrigger className="-ms-1" />
          {!showTrash &&
            breadcrumb.length > 1 &&
            breadcrumb.map((node, i) => (
              <button
                key={node.id}
                type="button"
                onClick={() => openPageId(node.id)}
                className="flex min-w-0 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              >
                {i > 0 && <ChevronRight className="size-3 shrink-0" />}
                <span className="max-w-48 truncate">{node.title || te('untitled')}</span>
              </button>
            ))}
          {!showTrash && wsId && selected && (
            <PageTags wsId={wsId} pageId={selected.id} />
          )}
        </div>

        <div className="flex-1">
          {showTrash && wsId ? (
            <TrashView
              wsId={wsId}
              onChanged={() => wsId && void loadTree(wsId)}
            />
          ) : error ? (
            <div className="p-8 text-sm text-destructive">{error}</div>
          ) : selected && wsId && docData ? (
            <div
              className="mx-auto h-full"
              style={{ maxWidth: 'var(--width-content)' }}
            >
              <Suspense fallback={null}>
                <EditorView
                  key={selected.id}
                  wsId={wsId}
                  pageId={selected.id}
                  initialData={docData}
                />
              </Suspense>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {t('selectPage')}
            </div>
          )}
        </div>

        {/* 弹窗：搜索（⌘K）/ 标签聚合 / 设置 / 重命名 */}
        {wsId && (
          <>
            <SearchDialog
              wsId={wsId}
              open={dialog === 'search'}
              onOpenChange={(o) => setDialog(o ? 'search' : null)}
              onOpenPage={openPageId}
              onCreatePage={() => void createPage()}
              onOpenTrash={() => setShowTrash(true)}
              onOpenTags={() => setDialog('tags')}
              onOpenSettings={() => setDialog('settings')}
            />
            <TagsDialog
              wsId={wsId}
              open={dialog === 'tags'}
              onOpenChange={(o) => setDialog(o ? 'tags' : null)}
              onOpenPage={openPageId}
            />
          </>
        )}
        <SettingsDialog
          open={dialog === 'settings'}
          onOpenChange={(o) => setDialog(o ? 'settings' : null)}
          name={me?.user.name ?? ''}
          onSaved={(n) => setMe((m) => (m ? { ...m, user: { ...m.user, name: n } } : m))}
        />
        <Dialog open={renameNode !== null} onOpenChange={(o) => !o && setRenameNode(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>{t('rename')}</DialogTitle>
            </DialogHeader>
            {/* 页面图标（P0-3）：常用 emoji 直选，或移除回退 📄 */}
            <div>
              <div className="mb-2 text-sm text-muted-foreground">{t('icon')}</div>
              <div className="flex flex-wrap gap-1">
                {PAGE_ICONS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => void setIcon(e)}
                    className={`flex size-8 items-center justify-center rounded-md text-lg hover:bg-sidebar-accent ${renameNode?.icon === e ? 'bg-sidebar-accent ring-1 ring-sidebar-primary' : ''}`}
                  >
                    {e}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => void setIcon(null)}
                  title={t('removeIcon')}
                  className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Input
                autoFocus
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void renamePage();
                }}
              />
              <Button size="sm" disabled={!renameDraft.trim()} onClick={() => void renamePage()}>
                {tc('save')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </SidebarInset>
    </SidebarProvider>
  );
}
