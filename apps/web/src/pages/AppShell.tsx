import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import type { PageTreeNode } from '@linkbase/contracts';
import { api, jsonBody } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import i18n, { syncDocumentLang } from '@/i18n';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

interface Me {
  user: { id: string; name: string; locale: 'zh-CN' | 'en' | null };
  workspaces: { id: string; name: string; role: string }[];
}

function TreeItem({
  node,
  depth,
  selectedId,
  onSelect,
}: {
  node: PageTreeNode;
  depth: number;
  selectedId: string | null;
  onSelect: (node: PageTreeNode) => void;
}) {
  const { t } = useTranslation('editor');
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(node)}
        className={`flex w-full items-center gap-1 rounded px-2 py-1 text-left text-sm hover:bg-sidebar-accent ${
          selectedId === node.id ? 'bg-sidebar-accent font-medium' : ''
        }`}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
      >
        <span>{node.icon ?? '📄'}</span>
        <span className="truncate">{node.title || t('untitled')}</span>
      </button>
      {node.children.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <TreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * Phase 0 最小壳（91 §1.1）：侧边栏页面树 + 页面元数据占位。
 * 编辑器挂载与 URL 化在 Phase 1（T1.1–T1.3）接入。
 */
export function AppShell() {
  const { t } = useTranslation('workspace');
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();
  const [me, setMe] = useState<Me | null>(null);
  const [wsId, setWsId] = useState<string | null>(null);
  const [tree, setTree] = useState<PageTreeNode[]>([]);
  const [selected, setSelected] = useState<PageTreeNode | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const createPage = async () => {
    if (!wsId) return;
    const page = await api<PageTreeNode>(`/workspaces/${wsId}/pages`, {
      method: 'POST',
      ...jsonBody({ title: '' }),
    });
    await loadTree(wsId);
    setSelected(page);
  };

  const logout = () => {
    useAuthStore.getState().clear();
    void navigate('/login');
  };

  return (
    <div className="flex min-h-dvh">
      <aside
        className="flex w-(--width-sidebar) shrink-0 flex-col border-r border-sidebar-border bg-sidebar"
        style={{ width: 'var(--width-sidebar)' }}
      >
        <div className="flex items-center justify-between px-3 py-3">
          <span className="truncate text-sm font-semibold">{me?.workspaces[0]?.name ?? 'Linkbase'}</span>
        </div>
        <div className="px-3 pb-2">
          <button
            type="button"
            onClick={() => void createPage()}
            className="w-full rounded bg-primary/10 px-2 py-1.5 text-left text-sm text-primary hover:bg-primary/15"
          >
            + {t('newPage')}
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-1.5 pb-3">
          <ul>
            {tree.map((node) => (
              <TreeItem
                key={node.id}
                node={node}
                depth={0}
                selectedId={selected?.id ?? null}
                onSelect={setSelected}
              />
            ))}
          </ul>
        </nav>
        <div className="flex items-center justify-between border-t border-sidebar-border px-3 py-2">
          <span className="truncate text-xs text-muted-foreground">{user?.name}</span>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <button type="button" onClick={logout} className="text-xs text-muted-foreground hover:text-foreground">
              {tc('logout')}
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1">
        {error ? (
          <div className="p-8 text-sm text-destructive">{error}</div>
        ) : selected ? (
          <article className="mx-auto px-8 py-12" style={{ maxWidth: 'var(--width-content)' }}>
            <h1 className="text-3xl font-bold">{selected.title || tc('appName')}</h1>
            <p className="mt-6 text-sm text-muted-foreground">{t('editorPhase1')}</p>
          </article>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {t('selectPage')}
          </div>
        )}
      </main>
    </div>
  );
}
