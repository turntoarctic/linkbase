/**
 * 应用级编辑器容器（05 §10）：按上游 std test-editor 同构——
 * BlockStdScope + <doc-title> + page/edgeless 双模式。
 * 不用装饰器（esbuild 无需额外配置）；属性用 Lit 静态 properties。
 * React 侧只通过 DOM 属性命令式传值（06 §1.1 红线 2）。
 */
import type { ExtensionType, Store } from '@blocksuite/store';
import { SignalWatcher, ShadowlessElement, WithDisposable } from '@blocksuite/std';
import { html, nothing, type PropertyValues } from 'lit';
import { BlockStdScope } from '@blocksuite/std';

export class AffineEditorContainer extends SignalWatcher(
  WithDisposable(ShadowlessElement),
) {
  static override properties = {
    doc: { attribute: false },
    specs: { attribute: false },
    mode: { attribute: false },
  };

  private _std!: BlockStdScope;

  get std(): BlockStdScope {
    return this._std;
  }

  accessor doc: Store | null = null;
  accessor specs: ExtensionType[] = [];
  accessor mode: 'page' | 'edgeless' = 'page';

  override connectedCallback(): void {
    super.connectedCallback();
    this._rebuild();
  }

  override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('doc') || changed.has('specs')) {
      this._rebuild();
    }
  }

  private _rebuild(): void {
    if (!this.doc || this.specs.length === 0) return;
    this._std = new BlockStdScope({
      store: this.doc,
      extensions: this.specs,
    });
  }

  override render() {
    if (!this.doc || !this._std) return nothing;
    return html`
      <div class="affine-editor-container affine-editor-${this.mode}">
        ${this.mode === 'page'
          ? html`<doc-title .doc=${this.doc}></doc-title>`
          : nothing}
        <div class="affine-editor-viewport">${this._std.render()}</div>
      </div>
    `;
  }
}

customElements.define('affine-editor-container', AffineEditorContainer);

declare global {
  interface HTMLElementTagNameMap {
    'affine-editor-container': AffineEditorContainer;
  }
}
