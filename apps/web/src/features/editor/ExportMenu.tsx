/**
 * 导出菜单（05 §8）：Markdown/HTML/DOCX/PDF，四种格式动态分包。
 * editor 实例由 AppShell 经 onReady 提升后传入。
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BlockNoteEditor } from '@blocknote/core';
import { FileDown } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { exportDocument, type ExportFormat } from './export';

const FORMATS = ['markdown', 'html', 'docx', 'pdf'] as const;

export function ExportMenu({
  editor,
  title,
}: {
  editor: BlockNoteEditor<any, any, any> | null;
  title: string;
}) {
  const { t } = useTranslation('workspace');
  const [exporting, setExporting] = useState<ExportFormat | null>(null);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" disabled={!editor || exporting !== null} title={t('export')}>
            <FileDown />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-44">
        {FORMATS.map((fmt) => (
          <DropdownMenuItem
            key={fmt}
            disabled={exporting !== null}
            onClick={() => {
              if (!editor) return;
              setExporting(fmt);
              void exportDocument(editor, fmt, title)
                .catch((err) => console.error('export failed:', err))
                .finally(() => setExporting(null));
            }}
          >
            <FileDown />
            {t(`export_${fmt}`)}
            {exporting === fmt && <span className="ms-auto text-xs text-muted-foreground">…</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
