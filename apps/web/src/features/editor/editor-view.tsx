/**
 * BlockNote 挂载（05 §4）：useCreateBlockNote + BlockNoteView，实例由 hook 持有，
 * 块状态不复制进 React state（红线 2）。自动保存：onChange 防抖 800ms → PUT /doc；卸载前 flush。
 * key={pageId} 重建实例；语言切换经 deps 重建（字典随语言）。
 * UI 完整形态（05 §3）：slash 菜单（默认 + 多栏 + 数学项）、格式工具栏、侧栏拖拽手柄、
 * 文件面板（uploadFile → blobs）、代码高亮（Shiki）、表格手柄，全部内建。
 */
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useCreateBlockNote, SuggestionMenuController, getDefaultReactSlashMenuItems } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
// 默认样式（官方 quickstart 标配）：Inter 字体 + Mantine UI 主题
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';
import { combineByGroup } from '@blocknote/core';
import { filterSuggestionItems } from '@blocknote/core/extensions';
import * as locales from '@blocknote/core/locales';
import { syntaxHighlighter } from '@blocknote/code-block';
import {
  getMultiColumnSlashMenuItems,
  locales as multiColumnLocales,
  multiColumnDropCursor,
} from '@blocknote/xl-multi-column';
import {
  getMathSlashMenuItems,
  locales as mathLocales,
} from '@blocknote/math-block';
import i18n from '@/i18n';
import { api } from '@/lib/api';
import { subscribeTheme } from '@/lib/theme';
import { schema, type EditorBlock } from './schema';

const SAVE_DEBOUNCE_MS = 800;

/** i18next locale → BlockNote 字典键（zh-CN → zh；math/multi-column 字典同 key，缺省回 en） */
function editorLocales(lang: string) {
  const key = lang.startsWith('zh') ? 'zh' : ('en' as keyof typeof locales);
  const dict = locales[key];
  return {
    ...dict,
    multi_column:
      multiColumnLocales[key as keyof typeof multiColumnLocales] ?? multiColumnLocales.en,
    math: mathLocales[key as keyof typeof mathLocales] ?? mathLocales.en,
  };
}

export function EditorView({
  wsId,
  pageId,
  initialData,
}: {
  wsId: string;
  pageId: string;
  initialData: EditorBlock[];
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef<Promise<void>>(Promise.resolve());

  const locale = (i18n.resolvedLanguage ?? 'en').split('-')[0] ?? 'en';
  // BlockNote 视图跟随应用主题（.dark 类）
  const theme = useSyncExternalStore(
    subscribeTheme,
    () => (document.documentElement.classList.contains('dark') ? 'dark' : 'light'),
  );
  const editor = useCreateBlockNote(
    {
      schema,
      // BlockNote 不接受空数组 initialContent（报错 must be non-empty）；空页省略即可
      ...(initialData.length > 0 ? { initialContent: initialData } : {}),
      extensions: [syntaxHighlighter],
      dropCursor: multiColumnDropCursor,
      dictionary: editorLocales(i18n.resolvedLanguage ?? 'en'),
      // 表格完整能力（05 §2.1）：表头行列、单元格底色/字色、拆分合并单元格
      tables: {
        splitCells: true,
        cellBackgroundColor: true,
        cellTextColor: true,
        headers: true,
      },
      uploadFile: async (file: File) => {
        // 复用 blobs 内容寻址端点（10 §5.3）；GET 免鉴权（<img> 无法带 Bearer 头）
        const fd = new FormData();
        fd.append('file', file);
        const out = await api<{ id: string }>(`/workspaces/${wsId}/blobs`, {
          method: 'POST',
          body: fd,
        });
        return `/api/blobs/${out.id}`;
      },
    },
    // 语言切换 → 重建编辑器（字典跟随）；翻 key 上的 pageId 由外层 key 重建
    [locale],
  );

  const persist = () => {
    savingRef.current = savingRef.current.then(async () => {
      try {
        await api<void>(`/workspaces/${wsId}/pages/${pageId}/doc`, {
          method: 'PUT',
          body: JSON.stringify(editor.document),
        });
      } catch {
        // 网络失败：下一轮 onChange 重试
      }
    });
  };
  const schedule = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(persist, SAVE_DEBOUNCE_MS);
  };

  // 卸载前 flush 未保存内容（切页/登出）
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      void persist();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // slash 菜单 = 默认项 + 多栏 + 数学（combineByGroup 保持分组相邻）
  const getSlashMenuItems = async (query: string) =>
    filterSuggestionItems(
      combineByGroup(
        combineByGroup(
          getDefaultReactSlashMenuItems(editor),
          getMultiColumnSlashMenuItems(editor),
        ),
        getMathSlashMenuItems(editor),
      ),
      query,
    );

  return (
    <BlockNoteView editor={editor} theme={theme} slashMenu={false} onChange={schedule}>
      <SuggestionMenuController triggerCharacter="/" getItems={getSlashMenuItems} />
    </BlockNoteView>
  );
}
