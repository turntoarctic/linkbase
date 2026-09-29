import { useEffect, useRef, useState } from 'react';
import type { Store } from '@blocksuite/store';
import { getEdgelessSpecs, getPageSpecs } from './specs';
import './affine-editor-container';

/**
 * 编辑器挂载（05 §5）：ref 命令式设属性；编辑器实例在 React 外部（红线 2），
 * 块状态一律不进 React state。
 */
export function EditorView({ store, mode = 'page' }: { store: Store; mode?: 'page' | 'edgeless' }) {
  const hostRef = useRef<HTMLElement | null>(null);
  const [, setReady] = useState(false);

  useEffect(() => {
    // 首次渲染后重跑一次，确保自定义元素已定义（initEditor 同步完成注册）
    setReady((r) => !r);
  }, []);

  useEffect(() => {
    const el = hostRef.current as (HTMLElement & { doc: Store | null; specs: unknown[]; mode: 'page' | 'edgeless' }) | null;
    if (!el) return;
    el.doc = store;
    el.specs = mode === 'edgeless' ? getEdgelessSpecs() : getPageSpecs();
    el.mode = mode;
  }, [store, mode]);

  return <affine-editor-container class="linkbase-editor" ref={hostRef} />;
}
