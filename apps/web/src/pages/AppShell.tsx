import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import type { PageTreeNode } from '@linkbase/contracts';
import { ChevronDown, ChevronRight, LogOut, Plus, Search, Settings, Trash2 } from 'lucide-react';
import { api, jsonBody } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import i18n, { syncDocumentLang, supportedLocales, type AppLocale } from '@/i18n';
import { changeLocale } from '@/components/LanguageSwitcher';
import { Button } from '@/components/ui/button';
import { SearchView, SettingsView, TrashView } from './SidebarViews';
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

function TreeItem({
  node,
  depth,
  selectedId,
  expanded,
  onToggle,
  onSelect,
  onAddChild,
}: {
  node: PageTreeNode;
  depth: number;
  selectedId: string | null;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (node: PageTreeNode) => void;
  onAddChild: (node: PageTreeNode) => void;
}) {
  const { t } = useTranslation('editor');
  const { t: tw } = useTranslation('workspace');
  const open = expanded.has(node.id);
  const hasChildren = node.children.length > 0;
  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelect(node)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(node);
          }
        }}
        className={`group/row flex h-7 cursor-pointer items-center gap-1 rounded-md pr-1 text-sm transition-colors duration-100 select-none hover:bg-sidebar-accent ${
          selectedId === node.id ? 'bg-sidebar-accent font-medium' : ''
        }`}
        style={{ paddingLeft: `${4 + depth * 14}px` }}
      >
        {/* 折叠箭头：有子页 hover 可见，叶子占位对齐 */}
        <button
          type="button"
          tabIndex={-1}
          aria-label={open ? tw('collapse') : tw('expand')}
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) onToggle(node.id);
          }}
          className={`flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-sidebar-accent ${
            hasChildren ? 'opacity-0 group-hover/row:opacity-100' : 'opacity-0'
          } ${open ? 'opacity-100' : ''}`}
        >
          <ChevronRight className={`size-3 ${open ? 'rotate-90' : ''}`} />
        </button>
        <span className="text-[13px] leading-none">{node.icon ?? '📄'}</span>
        <span className="truncate">{node.title || t('untitled')}</span>
        {/* hover 建子页（06 §5.5） */}
        <button
          type="button"
          tabIndex={-1}
          title={tw('addChildPage')}
          onClick={(e) => {
            e.stopPropagation();
            onAddChild(node);
          }}
          className="ml-auto flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity duration-100 hover:bg-sidebar-accent hover:text-foreground group-hover/row:opacity-100"
        >
          <Plus className="size-3.5" />
        </button>
      </div>
      {hasChildren && open && (
        <ul>
          {node.children.map((child) => (
            <TreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              expanded={expanded}
              onToggle={onToggle}
              onSelect={onSelect}
              onAddChild={onAddChild}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * Phase 0 壳（06 §5.4 骨架）：无全局 header，侧边栏 240px + 正文列 720px。
 * 空间头部 = 头像 + 名 + 下拉（语言/退出）；树行 hover 可建子页；底部常驻「＋ 新页面」。
 */
export function AppShell() {
  const { t } = useTranslation('workspace');
  const { t: tc } = useTranslation('common');
  const { t: te } = useTranslation('editor');
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const [me, setMe] = useState<Me | null>(null);
  const [wsId, setWsId] = useState<string | null>(null);
  const [tree, setTree] = useState<PageTreeNode[]>([]);
  const [selected, setSelected] = useState<PageTreeNode | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'page' | 'search' | 'trash' | 'settings'>('page');

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
  }, [loadTree]);

  const toggleExpanded = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const createPage = async (parentId?: string) => {
    if (!wsId) return;
    const page = await api<PageTreeNode>(`/workspaces/${wsId}/pages`, {
      method: 'POST',
      ...jsonBody({ title: '', ...(parentId ? { parentId } : {}) }),
    });
    await loadTree(wsId);
    if (parentId) {
      setExpanded((prev) => new Set(prev).add(parentId));
    }
    setSelected(page);
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
    <div className="flex h-dvh overflow-hidden">
      <aside className="flex w-(--width-sidebar) shrink-0 flex-col bg-sidebar">
        {/* 空间头部（Notion：头像方块 + 名 + 下拉菜单） */}
        <div className="p-2">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  className="group h-8 w-full justify-start gap-2 px-1.5"
                />
              }
            >
              <span className="flex size-5 shrink-0 items-center justify-center rounded bg-accent text-[11px] font-semibold text-accent-foreground">
                {(workspaceName ?? 'L').trim().charAt(0).toUpperCase()}
              </span>
              <span className="truncate font-medium">{workspaceName ?? 'Linkbase'}</span>
              <ChevronDown className="ml-auto size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-data-[popup-open]:opacity-100" />
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
                        <span className="ml-auto text-muted-foreground">✓</span>
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
        </div>

        {/* 快捷入口（06 §5.4：搜索/收藏/回收站在树上、设置沉底） */}
        <nav className="px-2 pb-1">
          <ul>
            {(
              [
                ['search', 'search', <Search key="s" />],
                ['trash', 'trash', <Trash2 key="t" />],
              ] as const
            ).map(([key, label, icon]) => (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => setView(key)}
                  className={`flex h-7 w-full items-center gap-2 rounded-md px-1.5 text-sm transition-colors duration-100 select-none hover:bg-sidebar-accent ${
                    view === key ? 'bg-sidebar-accent font-medium' : ''
                  }`}
                >
                  {icon}
                  <span>{t(label)}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* 页面树 */}
        <nav className="scrollbar-thin flex-1 overflow-y-auto px-2 pb-2">
          <ul>
            {tree.map((node) => (
              <TreeItem
                key={node.id}
                node={node}
                depth={0}
                selectedId={selected?.id ?? null}
                expanded={expanded}
                onToggle={toggleExpanded}
                onSelect={setSelected}
                onAddChild={(n) => void createPage(n.id)}
              />
            ))}
          </ul>
        </nav>

        {/* 底部：设置 + 常驻「＋ 新页面」（06 §5.4/§5.5） */}
        <div className="space-y-0.5 p-2">
          <Button
            variant="ghost"
            size="sm"
            className={`h-8 w-full justify-start gap-2 text-muted-foreground ${
              view === 'settings' ? 'bg-sidebar-accent' : ''
            }`}
            onClick={() => setView('settings')}
          >
            <Settings />
            {tc('settings')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-full justify-start gap-2 text-muted-foreground"
            onClick={() => {
              setView('page');
              void createPage();
            }}
          >
            <Plus />
            {t('newPage')}
          </Button>
        </div>
      </aside>

      <main className="scrollbar-thin flex-1 overflow-y-auto">
        {view === 'search' && wsId ? (
          <SearchView
            wsId={wsId}
            onOpen={(id) => {
              const hit = findPath(tree, id).at(-1);
              if (hit) {
                setSelected(hit);
                setView('page');
              }
            }}
          />
        ) : view === 'trash' && wsId ? (
          <TrashView wsId={wsId} onChanged={() => wsId && void loadTree(wsId)} />
        ) : view === 'settings' && me ? (
          <SettingsView
            name={me.user.name}
            onSaved={(n) =>
              setMe((m) => (m ? { ...m, user: { ...m.user, name: n } } : m))
            }
          />
        ) : error ? (
          <div className="p-8 text-sm text-destructive">{error}</div>
        ) : selected ? (
          <div className="mx-auto px-8 pb-24" style={{ maxWidth: 'var(--width-content)' }}>
            {/* 面包屑（06 §5.4：多级子页顶部小字路径） */}
            {breadcrumb.length > 1 && (
              <div className="flex items-center gap-1 pt-8 text-sm text-muted-foreground">
                {breadcrumb.map((node, i) => (
                  <span key={node.id} className="flex items-center gap-1">
                    {i > 0 && <ChevronRight className="size-3" />}
                    <span className="max-w-48 truncate">{node.title || te('untitled')}</span>
                  </span>
                ))}
              </div>
            )}
            <article className="pt-12">
              <h1 className="text-4xl font-bold tracking-tight">
                {selected.title || tc('appName')}
              </h1>
              <p className="mt-6 text-sm text-muted-foreground">{t('editorPhase1')}</p>
            </article>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {t('selectPage')}
          </div>
        )}
      </main>
    </div>
  );
}
