/**
 * 文档导出（05 §8）：Markdown / HTML（core 内建）+ DOCX / PDF（xl- 导出器，动态分包）。
 * 数学块映射必须合并进 docx/pdf 的 mappings，否则含公式的文档导出直接抛错。
 */
import type { BlockNoteEditor } from '@blocknote/core';
import i18n from '@/i18n';
import { schema } from './schema';

export type ExportFormat = 'markdown' | 'html' | 'docx' | 'pdf';

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function wrapHtml(bodyHtml: string, title: string): string {
  return `<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n<title>${title}</title>\n</head>\n<body>\n${bodyHtml}\n</body>\n</html>\n`;
}

export async function exportDocument(
  editor: BlockNoteEditor<any, any, any>,
  format: ExportFormat,
  title: string,
): Promise<void> {
  const safeName = (title || i18n.t('editor:untitled')).replace(/[\\/:*?"<>|]/g, '_');
  const blocks = editor.document;

  if (format === 'markdown') {
    const md = editor.blocksToMarkdownLossy(blocks);
    download(new Blob([md], { type: 'text/markdown;charset=utf-8' }), `${safeName}.md`);
    return;
  }
  if (format === 'html') {
    const html = editor.blocksToHTMLLossy(blocks);
    download(new Blob([wrapHtml(html, safeName)], { type: 'text/html;charset=utf-8' }), `${safeName}.html`);
    return;
  }
  if (format === 'docx') {
    const [{ DOCXExporter, docxDefaultSchemaMappings }, { mathBlockMapping, inlineMathMapping }] =
      await Promise.all([
        import('@blocknote/xl-docx-exporter'),
        import('@blocknote/math-block/docx-exporter'),
      ]);
    const exporter = new DOCXExporter(schema, {
      ...docxDefaultSchemaMappings,
      blockMapping: { ...docxDefaultSchemaMappings.blockMapping, mathBlock: mathBlockMapping },
      inlineContentMapping: {
        ...docxDefaultSchemaMappings.inlineContentMapping,
        math: inlineMathMapping,
      },
    });
    const blob = await exporter.toBlob(blocks, {
      sectionOptions: { properties: {} },
      documentOptions: { title: safeName },
      locale: i18nLocaleOOXML(),
    });
    download(blob, `${safeName}.docx`);
    return;
  }
  // pdf
  const [{ PDFExporter }, { typstDefaultSchemaMappings }, { mathBlockMapping, inlineMathMapping }] =
    await Promise.all([
      import('@blocknote/xl-pdf-exporter'),
      import('@blocknote/xl-typst-exporter'),
      import('@blocknote/math-block/typst-exporter'),
    ]);
  const exporter = new PDFExporter(schema, {
    ...typstDefaultSchemaMappings,
    blockMapping: { ...typstDefaultSchemaMappings.blockMapping, mathBlock: mathBlockMapping },
    inlineContentMapping: {
      ...typstDefaultSchemaMappings.inlineContentMapping,
      math: inlineMathMapping,
    },
  });
  const result = await exporter.toPDF(blocks, {
    title: title || undefined,
    lang: i18n.resolvedLanguage ?? 'zh-CN',
  });
  if (result.error === 'compile-failed') {
    throw new Error(`${i18n.t('workspace:exportPdfFailed')}：${result.compileErrors.map((e) => e.message).join('; ')}`);
  }
  download(result.blob, `${safeName}.pdf`);
}

function i18nLocaleOOXML(): string {
  const lang = i18n.resolvedLanguage ?? 'zh-CN';
  return lang === 'zh-CN' ? 'zh-CN' : 'en-US';
}
