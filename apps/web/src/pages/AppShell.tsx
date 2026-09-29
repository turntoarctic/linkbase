import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import type { PageMeta, PageTreeNode } from '@linkbase/contracts';
import { ChevronDown, ChevronRight, LogOut, Plus, Search, Settings, Trash2 } from 'lucide-react';
import { api, jsonBody } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import i18n, { syncDocumentLang, supportedLocales, type AppLocale } from '@/i18n';
import { changeLocale } from '@/components/LanguageSwitcher';
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
import { SearchDialog, SettingsDialog, TrashView } from './SidebarViews';

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

/** 页面树行（shadcn sidebar-07 组合式：行选中、箭头折叠、hover 建子页） */
function TreeItem({
  node,
  selectedId,
  onSelect,
  onAddChild,
}: {
  node: PageTreeNode;
  selectedId: string | null;
  onSelect: (node: PageTreeNode) => void;
  onAddChild: (node: PageTreeNode) => void;
}) {
  const { t } = useTranslation('editor');
  const { t: tw } = useTranslation('workspace');
  const [open, setOpen] = useState(false);
  const hasChildren = node.children.length > 0;
  const title = node.title || t('untitled');
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="group/collapsible">
      <SidebarMenuItem>
        <SidebarMenuButton
          tooltip={title}
          isActive={selectedId === node.id}
          onClick={() => onSelect(node)}
          className="text-[13px]"
        >
          <span aria-hidden>{node.icon ?? '📄'}</span>
          <span className="truncate">{title}</span>
          {hasChildren && (
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
              className="ms-auto rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
            >
              <ChevronRight className="size-3.5 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
            </span>
          )}
        </SidebarMenuButton>
        <SidebarMenuAction showOnHover onClick={() => { setOpen(true); onAddChild(node); }} title={tw('addChildPage')}>
          <Plus />
        </SidebarMenuAction>
        {hasChildren && (
          <CollapsibleContent>
            <SidebarMenuSub>
              {node.children.map((child) => (
                <TreeItem
                  key={child.id}
                  node={child}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  onAddChild={onAddChild}
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
  // 当前页由 URL（/:pageId）驱动，刷新/直达可恢复；showTrash 是唯一非页视图
  const [selected, setSelected] = useState<PageTreeNode | null>(null);
  const [showTrash, setShowTrash] = useState(false);
  const [dialog, setDialog] = useState<'search' | 'settings' | null>(null);
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

          {/* 页面树 */}
          <SidebarGroup>
            <SidebarGroupLabel>{t('pages')}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {tree.map((node) => (
                  <TreeItem
                    key={node.id}
                    node={node}
                    selectedId={showTrash ? null : (pageId ?? null)}
                    onSelect={openPage}
                    onAddChild={(n) => void createPage(n.id)}
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
        {/* 顶栏：折叠开关 + 面包屑（06 §5.4 多级子页路径，可点击跳转） */}
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
        </div>

        <div className="flex-1">
          {showTrash && wsId ? (
            <TrashView
              wsId={wsId}
              onChanged={() => wsId && void loadTree(wsId)}
            />
          ) : error ? (
            <div className="p-8 text-sm text-destructive">{error}</div>
          ) : selected ? (
            <article className="mx-auto px-8 pb-24" style={{ maxWidth: 'var(--width-content)' }}>
              <h1 className="text-4xl font-bold tracking-tight">
                {selected.title || tc('appName')}
              </h1>
              <p className="mt-6 text-sm text-muted-foreground">{t('editorPhase1')}</p>
            </article>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {t('selectPage')}
            </div>
          )}
        </div>

        {/* 弹窗：搜索（⌘K）/ 设置 */}
        {wsId && (
          <SearchDialog
            wsId={wsId}
            open={dialog === 'search'}
            onOpenChange={(o) => setDialog(o ? 'search' : null)}
            onOpenPage={openPageId}
          />
        )}
        <SettingsDialog
          open={dialog === 'settings'}
          onOpenChange={(o) => setDialog(o ? 'settings' : null)}
          name={me?.user.name ?? ''}
          onSaved={(n) => setMe((m) => (m ? { ...m, user: { ...m.user, name: n } } : m))}
        />
      </SidebarInset>
    </SidebarProvider>
  );
}
