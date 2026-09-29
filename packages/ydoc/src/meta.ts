/**
 * 服务端元数据提取（08 §5 / 05 §6，T0.4 方案二：纯 yjs 遍历，零 DOM）。
 * 结构事实（05 §6，vendored 0.22.4 核对）：块存于 page doc 的 `blocks` Map，
 * 块键 sys:id / sys:flavour / sys:children(Y.Array) / prop:*；
 * 标题 = affine:page 根块 prop:title（Y.Text）；正文 = 文本类块 prop:text；
 * 子页面/引用 = affine:embed-synced-doc|embed-linked-doc 的 prop:pageId。
 */
import * as Y from 'yjs';

const TEXT_FLAVOURS = new Set([
  'affine:paragraph',
  'affine:list',
  'affine:code',
  'affine:quote',
  'affine:callout',
  'affine:edgeless-text',
]);

const SUBPAGE_FLAVOURS = new Set(['affine:embed-synced-doc']);
const LINKED_FLAVOURS = new Set(['affine:embed-linked-doc']);

export interface PageMeta {
  title: string;
  text: string;
  /** 本页内的子页面块指向的页面 id（子页的 parent_id = 本页） */
  subPageIds: string[];
  /** 链接块引用的页面 id（P2 反链用，先只提取） */
  refPageIds: string[];
}

function blockFlavour(block: Y.Map<unknown>): string {
  const v = block.get('sys:flavour');
  return typeof v === 'string' ? v : '';
}

export function extractPageMeta(doc: Y.Doc): PageMeta {
  const blocks = doc.getMap<Y.Map<unknown>>('blocks');
  let title = '';
  const texts: string[] = [];
  const subPageIds = new Set<string>();
  const refPageIds = new Set<string>();

  blocks.forEach((block) => {
    const flavour = blockFlavour(block);
    if (!flavour) return;
    if (flavour === 'affine:page') {
      if (!title) {
        const t = block.get('prop:title');
        if (t instanceof Y.Text) title = t.toString();
      }
      return;
    }
    if (SUBPAGE_FLAVOURS.has(flavour) || LINKED_FLAVOURS.has(flavour)) {
      const pid = block.get('prop:pageId');
      if (typeof pid === 'string' && pid) {
        (SUBPAGE_FLAVOURS.has(flavour) ? subPageIds : refPageIds).add(pid);
      }
      return;
    }
    if (TEXT_FLAVOURS.has(flavour)) {
      const t = block.get('prop:text');
      if (t instanceof Y.Text && t.length > 0) texts.push(t.toString());
    }
  });

  return { title, text: texts.join('\n'), subPageIds: [...subPageIds], refPageIds: [...refPageIds] };
}

/** 从合并后的全量状态（update 二进制）提取 —— 服务端主入口（08 §5） */
export function extractMetaFromState(state: Uint8Array): PageMeta {
  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, state);
    return extractPageMeta(doc);
  } finally {
    doc.destroy();
  }
}

/** 正文参与搜索的截断长度（08 §6：trigram 参与 20000 字符） */
export const SEARCH_TEXT_LIMIT = 20000;
