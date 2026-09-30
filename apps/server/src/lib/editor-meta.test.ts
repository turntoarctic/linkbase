import { describe, test, expect } from 'bun:test';
import { deriveMeta } from './editor-meta';

/** BlockNote 块形状（05 §6）：StyledText / link / tableContent(TableCell) / children 递归 */
describe('deriveMeta（BlockNote 块数组 → 搜索文本）', () => {
  test('文本块与行内样式', () => {
    const { text } = deriveMeta([
      {
        id: 'p1',
        type: 'paragraph',
        props: {},
        content: [
          { type: 'text', text: '加粗', styles: { bold: true } },
          { type: 'text', text: '与正文', styles: {} },
        ],
      },
    ]);
    expect(text).toBe('加粗\n与正文');
  });

  test('表格：header/普通单元格 + 链接格', () => {
    const { text } = deriveMeta([
      {
        id: 't1',
        type: 'table',
        props: {},
        content: {
          type: 'tableContent',
          columnWidths: [100, 100],
          headerRows: 1,
          rows: [
            {
              cells: [
                {
                  type: 'tableCell',
                  props: {},
                  content: [{ type: 'text', text: '表头甲', styles: {} }],
                },
                { type: 'tableCell', props: {}, content: [{ type: 'text', text: '表头乙', styles: {} }] },
              ],
            },
            {
              cells: [
                { type: 'tableCell', props: {}, content: [{ type: 'text', text: '单元格', styles: {} }] },
                {
                  type: 'tableCell',
                  props: {},
                  content: [
                    { type: 'link', href: '/x', content: [{ type: 'text', text: '链接格', styles: {} }] },
                  ],
                },
              ],
            },
          ],
        },
      },
    ]);
    expect(text).toBe('表头甲\n表头乙\n单元格\n链接格');
  });

  test('嵌套子块（列表 children）与未知形状跳过', () => {
    const { text } = deriveMeta([
      {
        id: 'b1',
        type: 'bulletListItem',
        props: {},
        content: [{ type: 'text', text: '父项', styles: {} }],
        children: [
          {
            id: 'b2',
            type: 'bulletListItem',
            props: {},
            content: [{ type: 'text', text: '子项', styles: {} }],
          },
        ],
      },
      { id: 'x', type: '未知块', props: { a: 1 } },
    ]);
    expect(text).toBe('父项\n子项');
  });

  test('非数组/空输入安全', () => {
    expect(deriveMeta(null).text).toBe('');
    expect(deriveMeta([]).text).toBe('');
    expect(deriveMeta({ blocks: [] }).text).toBe('');
  });
});
