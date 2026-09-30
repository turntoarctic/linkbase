/**
 * BlockNote 内容 → 派生元数据（08 §5）。真相=pages.content JSONB（块数组）；
 * title 由 PATCH 唯一写入，此处只提取 text 供搜索。
 * 形状事实（05 §6）：block.content = StyledText[]（{type:'text',text}）或
 * tableContent（rows[].cells[]）；嵌套子块在 block.children。未知块跳过——提取宽松，不让派生挂掉写路径。
 */
export interface DerivedMeta {
  text: string;
}

/** 递归收集字符串（文本片段/表格单元格/嵌套子块） */
function collect(value: unknown, out: string[]): void {
  if (typeof value === 'string') {
    const s = value.trim();
    if (s) out.push(s);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collect(item, out);
    return;
  }
  if (value && typeof value === 'object') {
    const r = value as Record<string, unknown>;
    if (typeof r.text === 'string') collect(r.text, out); // StyledText / 纯文本 cell
    if (r.content !== undefined) collect(r.content, out); // 块载荷 / tableContent
    if (r.cells !== undefined) collect(r.cells, out); // 表格行
    if (r.rows !== undefined) collect(r.rows, out); // tableContent → rows
    if (r.children !== undefined) collect(r.children, out); // 嵌套子块
  }
}

export function deriveMeta(content: unknown): DerivedMeta {
  const out: string[] = [];
  if (Array.isArray(content)) collect(content, out);
  return { text: out.join('\n') };
}

/** 正文参与搜索的截断长度（08 §6：trigram 参与 20000 字符） */
export const SEARCH_TEXT_LIMIT = 20000;
