/**
 * Linkbase 编辑器 schema（05 §3）：BlockNote 默认 schema 全量 + 官方扩展包。
 * - 默认块：paragraph / heading(1-6, 可折叠) / quote / divider / bullet·numbered·checkListItem /
 *   codeBlock / table / image / video / audio / file；
 * - 代码高亮：@blocknote/code-block（Shiki，斜杠菜单插入即高亮）；
 * - 多栏布局：@blocknote/xl-multi-column（columnList/column，copyleft 许可，见 05 §7）；
 * - 数学公式：@blocknote/math-block（LaTeX 块 + 行内公式，KaTeX 渲染）。
 * 扩展编辑器能力 = 改这里（如自定义块），禁止散落在组件里。
 */
import { BlockNoteSchema, createCodeBlockSpec, type Block } from '@blocknote/core';
import { codeBlockOptions } from '@blocknote/code-block';
import { withMultiColumn } from '@blocknote/xl-multi-column';
import { createReactMathBlockSpec, createReactInlineMathSpec } from '@blocknote/math-block';

export const schema = withMultiColumn(
  BlockNoteSchema.create().extend({
    blockSpecs: {
      codeBlock: createCodeBlockSpec(codeBlockOptions),
      mathBlock: createReactMathBlockSpec(),
    },
    inlineContentSpecs: {
      math: createReactInlineMathSpec(),
    },
  }),
);

/** 文档块类型（GET/PUT /doc 载荷元素，contracts docContentSchema 对应） */
export type EditorBlock = Block<any, any, any>;
