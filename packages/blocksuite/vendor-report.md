# BlockSuite vendor 同步报告

- 上游：https://github.com/toeverything/blocksuite.git（tag v0.22.4）
- 基线版本：0.22.4
- 迁入包数：69

本地补丁：无（改动须登记 91 §6 变更记录）

## 包清单

| 包 | 版本 | 上游路径 | 落位 |
|----|------|----------|------|
| @blocksuite/affine | 0.22.4 | packages/affine/all | affine |
| @blocksuite/affine-block-attachment | 0.22.4 | packages/affine/blocks/attachment | affine-blocks/attachment |
| @blocksuite/affine-block-bookmark | 0.22.4 | packages/affine/blocks/bookmark | affine-blocks/bookmark |
| @blocksuite/affine-block-callout | 0.22.4 | packages/affine/blocks/callout | affine-blocks/callout |
| @blocksuite/affine-block-code | 0.22.4 | packages/affine/blocks/code | affine-blocks/code |
| @blocksuite/affine-block-data-view | 0.22.4 | packages/affine/blocks/data-view | affine-blocks/data-view |
| @blocksuite/affine-block-database | 0.22.4 | packages/affine/blocks/database | affine-blocks/database |
| @blocksuite/affine-block-divider | 0.22.4 | packages/affine/blocks/divider | affine-blocks/divider |
| @blocksuite/affine-block-edgeless-text | 0.22.4 | packages/affine/blocks/edgeless-text | affine-blocks/edgeless-text |
| @blocksuite/affine-block-embed | 0.22.4 | packages/affine/blocks/embed | affine-blocks/embed |
| @blocksuite/affine-block-embed-doc | 0.22.4 | packages/affine/blocks/embed-doc | affine-blocks/embed-doc |
| @blocksuite/affine-block-frame | 0.22.4 | packages/affine/blocks/frame | affine-blocks/frame |
| @blocksuite/affine-block-image | 0.22.4 | packages/affine/blocks/image | affine-blocks/image |
| @blocksuite/affine-block-latex | 0.22.4 | packages/affine/blocks/latex | affine-blocks/latex |
| @blocksuite/affine-block-list | 0.22.4 | packages/affine/blocks/list | affine-blocks/list |
| @blocksuite/affine-block-note | 0.22.4 | packages/affine/blocks/note | affine-blocks/note |
| @blocksuite/affine-block-paragraph | 0.22.4 | packages/affine/blocks/paragraph | affine-blocks/paragraph |
| @blocksuite/affine-block-root | 0.22.4 | packages/affine/blocks/root | affine-blocks/root |
| @blocksuite/affine-block-surface | 0.22.4 | packages/affine/blocks/surface | affine-blocks/surface |
| @blocksuite/affine-block-surface-ref | 0.22.4 | packages/affine/blocks/surface-ref | affine-blocks/surface-ref |
| @blocksuite/affine-block-table | 0.22.4 | packages/affine/blocks/table | affine-blocks/table |
| @blocksuite/affine-components | 0.22.4 | packages/affine/components | affine-components |
| @blocksuite/affine-ext-loader | 0.22.4 | packages/affine/ext-loader | affine-ext-loader |
| @blocksuite/affine-foundation | 0.22.4 | packages/affine/foundation | affine-foundation |
| @blocksuite/affine-fragment-adapter-panel | 0.22.4 | packages/affine/fragments/adapter-panel | affine-fragments/adapter-panel |
| @blocksuite/affine-fragment-doc-title | 0.22.4 | packages/affine/fragments/doc-title | affine-fragments/doc-title |
| @blocksuite/affine-fragment-frame-panel | 0.22.4 | packages/affine/fragments/frame-panel | affine-fragments/frame-panel |
| @blocksuite/affine-fragment-outline | 0.22.4 | packages/affine/fragments/outline | affine-fragments/outline |
| @blocksuite/affine-gfx-brush | 0.22.4 | packages/affine/gfx/brush | affine-gfx/brush |
| @blocksuite/affine-gfx-connector | 0.22.4 | packages/affine/gfx/connector | affine-gfx/connector |
| @blocksuite/affine-gfx-group | 0.22.4 | packages/affine/gfx/group | affine-gfx/group |
| @blocksuite/affine-gfx-link | 0.22.4 | packages/affine/gfx/link | affine-gfx/link |
| @blocksuite/affine-gfx-mindmap | 0.22.4 | packages/affine/gfx/mindmap | affine-gfx/mindmap |
| @blocksuite/affine-gfx-note | 0.22.4 | packages/affine/gfx/note | affine-gfx/note |
| @blocksuite/affine-gfx-pointer | 0.22.4 | packages/affine/gfx/pointer | affine-gfx/pointer |
| @blocksuite/affine-gfx-shape | 0.22.4 | packages/affine/gfx/shape | affine-gfx/shape |
| @blocksuite/affine-gfx-template | 0.22.4 | packages/affine/gfx/template | affine-gfx/template |
| @blocksuite/affine-gfx-text | 0.22.4 | packages/affine/gfx/text | affine-gfx/text |
| @blocksuite/affine-gfx-turbo-renderer | 0.22.4 | packages/affine/gfx/turbo-renderer | affine-gfx/turbo-renderer |
| @blocksuite/affine-inline-footnote | 0.22.4 | packages/affine/inlines/footnote | affine-inlines/footnote |
| @blocksuite/affine-inline-latex | 0.22.4 | packages/affine/inlines/latex | affine-inlines/latex |
| @blocksuite/affine-inline-link | 0.22.4 | packages/affine/inlines/link | affine-inlines/link |
| @blocksuite/affine-inline-mention | 0.22.4 | packages/affine/inlines/mention | affine-inlines/mention |
| @blocksuite/affine-inline-preset | 0.22.4 | packages/affine/inlines/preset | affine-inlines/preset |
| @blocksuite/affine-inline-reference | 0.22.4 | packages/affine/inlines/reference | affine-inlines/reference |
| @blocksuite/affine-model | 0.22.4 | packages/affine/model | affine-model |
| @blocksuite/affine-rich-text | 0.22.4 | packages/affine/rich-text | affine-rich-text |
| @blocksuite/affine-shared | 0.22.4 | packages/affine/shared | affine-shared |
| @blocksuite/affine-widget-drag-handle | 0.22.4 | packages/affine/widgets/drag-handle | affine-widgets/drag-handle |
| @blocksuite/affine-widget-edgeless-auto-connect | 0.22.4 | packages/affine/widgets/edgeless-auto-connect | affine-widgets/edgeless-auto-connect |
| @blocksuite/affine-widget-edgeless-dragging-area | 0.22.4 | packages/affine/widgets/edgeless-dragging-area | affine-widgets/edgeless-dragging-area |
| @blocksuite/affine-widget-edgeless-selected-rect | 0.22.4 | packages/affine/widgets/edgeless-selected-rect | affine-widgets/edgeless-selected-rect |
| @blocksuite/affine-widget-edgeless-toolbar | 0.22.4 | packages/affine/widgets/edgeless-toolbar | affine-widgets/edgeless-toolbar |
| @blocksuite/affine-widget-edgeless-zoom-toolbar | 0.22.4 | packages/affine/widgets/edgeless-zoom-toolbar | affine-widgets/edgeless-zoom-toolbar |
| @blocksuite/affine-widget-frame-title | 0.22.4 | packages/affine/widgets/frame-title | affine-widgets/frame-title |
| @blocksuite/affine-widget-keyboard-toolbar | 0.22.4 | packages/affine/widgets/keyboard-toolbar | affine-widgets/keyboard-toolbar |
| @blocksuite/affine-widget-linked-doc | 0.22.4 | packages/affine/widgets/linked-doc | affine-widgets/linked-doc |
| @blocksuite/affine-widget-note-slicer | 0.22.4 | packages/affine/widgets/note-slicer | affine-widgets/note-slicer |
| @blocksuite/affine-widget-page-dragging-area | 0.22.4 | packages/affine/widgets/page-dragging-area | affine-widgets/page-dragging-area |
| @blocksuite/affine-widget-remote-selection | 0.22.4 | packages/affine/widgets/remote-selection | affine-widgets/remote-selection |
| @blocksuite/affine-widget-scroll-anchoring | 0.22.4 | packages/affine/widgets/scroll-anchoring | affine-widgets/scroll-anchoring |
| @blocksuite/affine-widget-slash-menu | 0.22.4 | packages/affine/widgets/slash-menu | affine-widgets/slash-menu |
| @blocksuite/affine-widget-toolbar | 0.22.4 | packages/affine/widgets/toolbar | affine-widgets/toolbar |
| @blocksuite/affine-widget-viewport-overlay | 0.22.4 | packages/affine/widgets/viewport-overlay | affine-widgets/viewport-overlay |
| @blocksuite/data-view | 0.22.4 | packages/affine/data-view | affine-data-view |
| @blocksuite/global | 0.22.4 | packages/framework/global | global |
| @blocksuite/std | 0.22.4 | packages/framework/std | std |
| @blocksuite/store | 0.22.4 | packages/framework/store | store |
| @blocksuite/sync | 0.22.4 | packages/framework/sync | sync |
