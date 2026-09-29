/**
 * specs 装配（05 §10 已验证事实）：
 * - 无独立 effects 副作用入口（@blocksuite/affine/effects 是纯类型模块）；
 * - 自定义元素注册发生在构建 specs 时：ViewExtensionManager(...).get('page'|'edgeless')
 *   触发各 provider 的 effect() → customElements.define；
 * - Store 扩展（schema 等）在 doc.getStore({ extensions }) 时传入。
 */
import { StoreExtensionManager, ViewExtensionManager } from '@blocksuite/affine/ext-loader';
import { getInternalStoreExtensions } from '@blocksuite/affine/extensions/store';
import { getInternalViewExtensions } from '@blocksuite/affine/extensions/view';
import type { ExtensionType } from '@blocksuite/store';

let inited = false;

/** 模块加载即注册全部自定义元素（05 §5 约定 1） */
export function initEditor(): void {
  if (inited) return;
  inited = true;
  void getStoreSpecs();
  void getPageSpecs();
  void getEdgelessSpecs();
}

export function getStoreSpecs(): ExtensionType[] {
  return new StoreExtensionManager(getInternalStoreExtensions()).get('store');
}

export function getPageSpecs(): ExtensionType[] {
  return new ViewExtensionManager(getInternalViewExtensions()).get('page');
}

export function getEdgelessSpecs(): ExtensionType[] {
  return new ViewExtensionManager(getInternalViewExtensions()).get('edgeless');
}
