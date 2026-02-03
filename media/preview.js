// @ts-check

/**
 * Looks Good - Preview WebView Script
 * Handles element selection, visual editing, and communication with the extension
 */

(function () {
    // @ts-ignore
    const vscode = acquireVsCodeApi();

    /** @type {typeof window.initialConfig} */
    // @ts-ignore
    let config = window.initialConfig || {
        autoRefresh: true,
        refreshDelay: 100,
        defaultZoom: 100,
        syncScroll: true,
        showCssPanel: true
    };

    let zoomLevel = config.defaultZoom;
    let selectedElement = null;
    let hoveredElement = null;
    let isDragging = false;
    let dragElement = null;
    let currentHtml = '';
    let baseUri = '';
    let isEditingText = false;

    // Element tracking - maps lg-id to source info
    const elementSourceMap = new Map();

    // DOM Elements
    const iframe = document.getElementById('preview-iframe');
    const previewFrame = document.getElementById('preview-frame');
    const zoomDisplay = document.getElementById('zoom-level');
    const elementInfo = document.querySelector('.element-info .element-tag');
    const cssPanel = document.getElementById('css-panel');
    const cssProperties = document.getElementById('css-properties');
    const btnZoomIn = document.getElementById('btn-zoom-in');
    const btnZoomOut = document.getElementById('btn-zoom-out');
    const btnZoomReset = document.getElementById('btn-zoom-reset');
    const btnRefresh = document.getElementById('btn-refresh');
    const btnCloseCss = document.getElementById('btn-close-css');
    const btnUndo = document.getElementById('btn-undo');
    const btnRedo = document.getElementById('btn-redo');
    const btnDevtools = document.getElementById('btn-devtools');

    // Initialize
    function init() {
        setupToolbarEvents();
        setupMessageListener();
        setupKeyboardShortcuts();

        // Notify extension we're ready
        vscode.postMessage({ type: 'ready' });
    }

    function setupToolbarEvents() {
        btnZoomIn?.addEventListener('click', () => setZoom(zoomLevel + 25));
        btnZoomOut?.addEventListener('click', () => setZoom(zoomLevel - 25));
        btnZoomReset?.addEventListener('click', () => setZoom(config.defaultZoom));
        btnRefresh?.addEventListener('click', () => vscode.postMessage({ type: 'request-refresh' }));
        btnUndo?.addEventListener('click', () => vscode.postMessage({ type: 'trigger-undo' }));
        btnRedo?.addEventListener('click', () => vscode.postMessage({ type: 'trigger-redo' }));
        btnDevtools?.addEventListener('click', () => vscode.postMessage({ type: 'open-devtools' }));
        btnCloseCss?.addEventListener('click', () => {
            if (cssPanel) cssPanel.style.display = 'none';
        });
    }

    function setupMessageListener() {
        window.addEventListener('message', (event) => {
            const message = event.data;

            switch (message.type) {
                case 'update-content':
                    currentHtml = message.html;
                    baseUri = message.baseUri;
                    updatePreview(message.html, message.baseUri);
                    break;

                case 'zoom':
                    setZoom(message.level);
                    break;

                case 'select-element':
                    selectElementByLine(message.line, message.column);
                    break;

                case 'config-update':
                    config = message.config;
                    if (cssPanel) {
                        cssPanel.style.display = config.showCssPanel ? 'flex' : 'none';
                    }
                    break;
            }
        });
    }

    function setupKeyboardShortcuts() {
        document.addEventListener('keydown', handleKeyDown, true);
    }

    function handleKeyDown(e) {
        if (isEditingText && e.key !== 'Escape') return;

        const isCtrlOrCmd = e.ctrlKey || e.metaKey;

        if (isCtrlOrCmd) {
            // Undo: Ctrl + Z
            if (e.code === 'KeyZ' && !e.shiftKey) {
                e.preventDefault();
                e.stopPropagation();
                vscode.postMessage({ type: 'trigger-undo' });
                return;
            }

            // Redo: Ctrl + Y or Ctrl + Shift + Z
            if (e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey)) {
                e.preventDefault();
                e.stopPropagation();
                vscode.postMessage({ type: 'trigger-redo' });
                return;
            }

            // Zoom In
            if (e.code === 'Equal' || e.code === 'NumpadAdd') {
                e.preventDefault();
                e.stopPropagation();
                setZoom(zoomLevel + 25);
                return;
            }

            // Zoom Out
            if (e.code === 'Minus' || e.code === 'NumpadSubtract') {
                e.preventDefault();
                e.stopPropagation();
                setZoom(zoomLevel - 25);
                return;
            }

            // Reset Zoom
            if (e.code === 'Digit0' || e.code === 'Numpad0') {
                e.preventDefault();
                e.stopPropagation();
                setZoom(config.defaultZoom);
                return;
            }
        }

        // Delete selected element
        if ((e.key === 'Delete' || e.key === 'Backspace') && selectedElement && !isEditingText) {
            e.preventDefault();
            e.stopPropagation();
            deleteSelectedElement();
        }

        // Escape to cancel editing
        if (e.key === 'Escape' && isEditingText) {
            cancelInlineEditing();
        }
    }

    function setZoom(level) {
        zoomLevel = Math.max(25, Math.min(400, level));
        if (iframe) {
            iframe.style.transform = `scale(${zoomLevel / 100})`;
            iframe.style.width = `${10000 / zoomLevel}%`;
            iframe.style.height = `${10000 / zoomLevel}%`;
        }
        if (zoomDisplay) {
            zoomDisplay.textContent = `${zoomLevel}%`;
        }
    }

    // Delete element functionality - sends the exact element content to delete
    function deleteSelectedElement() {
        if (!selectedElement) return;

        const sourceInfo = getElementSourceInfo(selectedElement);
        if (!sourceInfo) return;

        // Send delete request with full context
        vscode.postMessage({
            type: 'delete-element',
            lineNumber: sourceInfo.lineNumber,
            tagName: sourceInfo.tagName,
            elementIndex: sourceInfo.elementIndex,
            outerHtml: sourceInfo.originalOuterHtml
        });

        // Remove from DOM
        selectedElement.remove();
        selectedElement = null;

        if (elementInfo) {
            elementInfo.textContent = '';
        }
        if (cssProperties) {
            cssProperties.innerHTML = '<p class="no-selection">Select an element to edit its styles</p>';
        }
    }

    // Get source info for an element
    function getElementSourceInfo(element) {
        const lgId = element.getAttribute('data-lg-id');
        if (elementSourceMap.has(lgId)) {
            return elementSourceMap.get(lgId);
        }

        // Fallback - reconstruct from attributes
        const lineNumber = parseInt(element.getAttribute('data-lg-line') || '1');
        const elementIndex = parseInt(element.getAttribute('data-lg-index') || '0');
        const tagName = element.tagName.toLowerCase();

        return {
            lineNumber,
            tagName,
            elementIndex,
            originalOuterHtml: getCleanOuterHtml(element)
        };
    }

    // Get outer HTML without our injected attributes
    function getCleanOuterHtml(element) {
        const clone = element.cloneNode(true);
        clone.removeAttribute('data-lg-id');
        clone.removeAttribute('data-lg-line');
        clone.removeAttribute('data-lg-index');
        clone.removeAttribute('draggable');
        clone.classList.remove('looks-good-selected', 'looks-good-hover', 'looks-good-editing', 'looks-good-dragging', 'looks-good-drop-target');
        if (clone.classList.length === 0) {
            clone.removeAttribute('class');
        }
        return clone.outerHTML;
    }

    function updatePreview(html, base) {
        if (!iframe) return;

        // Clear element source map
        elementSourceMap.clear();

        // Inject source line markers, unique IDs, and styles
        const processedHtml = injectLineMarkersAndIds(html);

        // Create blob URL for the content
        const fullHtml = `
<!DOCTYPE html>
<html>
<head>
  <base href="${base}/">
  <style>
    .looks-good-selected {
      outline: 2px solid #007acc !important;
      outline-offset: 1px !important;
      cursor: pointer;
    }
    .looks-good-hover {
      outline: 1px dashed #007acc !important;
      outline-offset: 1px !important;
      cursor: pointer;
    }
    .looks-good-dragging {
      opacity: 0.5 !important;
    }
    .looks-good-drop-target {
      outline: 2px dashed #28a745 !important;
      outline-offset: 2px !important;
    }
    .looks-good-editing {
      outline: 2px solid #ffc107 !important;
      outline-offset: 1px !important;
      cursor: text !important;
    }
    * {
      cursor: default;
    }
  </style>
</head>
<body>
${processedHtml}
</body>
</html>`;

        const blob = new Blob([fullHtml], { type: 'text/html' });
        const url = URL.createObjectURL(blob);

        iframe.onload = () => {
            URL.revokeObjectURL(url);
            setupIframeEvents();
        };

        iframe.src = url;
    }

    function injectLineMarkersAndIds(html) {
        const lines = html.split('\n');
        let result = '';
        let elementId = 0;

        // Track element occurrences per line for unique identification
        const lineElementCounts = {};

        for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
            const lineNum = lineIdx + 1;
            let line = lines[lineIdx];
            let processedLine = '';
            let i = 0;

            while (i < line.length) {
                // Look for opening tag
                if (line[i] === '<' && line[i + 1] !== '/' && line[i + 1] !== '!') {
                    // Find end of tag
                    let tagEnd = line.indexOf('>', i);
                    if (tagEnd === -1) {
                        processedLine += line.slice(i);
                        break;
                    }

                    const tagContent = line.slice(i, tagEnd + 1);
                    const tagMatch = tagContent.match(/<(\w+)/);

                    if (tagMatch) {
                        const tagName = tagMatch[1].toLowerCase();

                        // Skip void elements and special tags
                        if (!['meta', 'link', 'br', 'hr', 'img', 'input', 'area', 'base', 'col', 'embed', 'param', 'source', 'track', 'wbr', 'script', 'style', '!doctype'].includes(tagName)) {
                            // Count element occurrence on this line
                            const lineKey = `${lineNum}-${tagName}`;
                            lineElementCounts[lineKey] = (lineElementCounts[lineKey] || 0);
                            const elementIndex = lineElementCounts[lineKey];
                            lineElementCounts[lineKey]++;

                            const lgId = `lg-${elementId++}`;

                            // Store source info
                            elementSourceMap.set(lgId, {
                                lineNumber: lineNum,
                                tagName: tagName,
                                elementIndex: elementIndex,
                                originalLine: line
                            });

                            // Inject attributes before closing >
                            const attrs = ` data-lg-id="${lgId}" data-lg-line="${lineNum}" data-lg-index="${elementIndex}"`;

                            if (tagContent.endsWith('/>')) {
                                // Self-closing tag
                                processedLine += tagContent.slice(0, -2) + attrs + '/>';
                            } else {
                                processedLine += tagContent.slice(0, -1) + attrs + '>';
                            }

                            i = tagEnd + 1;
                            continue;
                        }
                    }

                    processedLine += tagContent;
                    i = tagEnd + 1;
                } else {
                    processedLine += line[i];
                    i++;
                }
            }

            result += processedLine + '\n';
        }

        return result;
    }

    function setupIframeEvents() {
        const iframeDoc = iframe?.contentDocument;
        if (!iframeDoc) return;

        // Click to select element
        iframeDoc.addEventListener('click', (e) => {
            if (isEditingText) return;

            e.preventDefault();
            e.stopPropagation();

            const target = e.target;
            if (target && target !== iframeDoc.body && target !== iframeDoc.documentElement) {
                selectElement(target);
            }
        });

        // Double-click to edit text
        iframeDoc.addEventListener('dblclick', (e) => {
            e.preventDefault();
            e.stopPropagation();

            const target = e.target;
            if (target && target !== iframeDoc.body && target !== iframeDoc.documentElement) {
                startInlineEditing(target);
            }
        });

        // Hover to highlight
        iframeDoc.addEventListener('mouseover', (e) => {
            if (isEditingText) return;

            const target = e.target;
            if (target && target !== iframeDoc.body && target !== iframeDoc.documentElement) {
                if (hoveredElement && hoveredElement !== selectedElement) {
                    hoveredElement.classList.remove('looks-good-hover');
                }
                if (target !== selectedElement) {
                    target.classList.add('looks-good-hover');
                    hoveredElement = target;
                }
            }
        });

        iframeDoc.addEventListener('mouseout', (e) => {
            if (hoveredElement && hoveredElement !== selectedElement) {
                hoveredElement.classList.remove('looks-good-hover');
                hoveredElement = null;
            }
        });

        // Keyboard events in iframe
        iframeDoc.addEventListener('keydown', (e) => {
            handleKeyDown(e);

            // Handle copy/cut/paste only when not editing text
            if (!isEditingText && (e.ctrlKey || e.metaKey)) {
                if (e.code === 'KeyC' && selectedElement) {
                    e.preventDefault();
                    copyElement(false);
                } else if (e.code === 'KeyX' && selectedElement) {
                    e.preventDefault();
                    copyElement(true);
                } else if (e.code === 'KeyV') {
                    e.preventDefault();
                    pasteElement();
                }
            }
        }, true);

        // Setup drag and drop for all tagged elements
        iframeDoc.querySelectorAll('[data-lg-id]').forEach(el => {
            setupDragEvents(el, iframeDoc);
        });
    }

    // Inline text editing
    function startInlineEditing(element) {
        if (isEditingText) {
            finishInlineEditing();
        }

        isEditingText = true;
        selectedElement = element;

        // Store original text for comparison
        const originalText = element.textContent;
        const sourceInfo = getElementSourceInfo(element);

        // Make element editable
        element.setAttribute('contenteditable', 'true');
        element.classList.remove('looks-good-selected', 'looks-good-hover');
        element.classList.add('looks-good-editing');
        element.focus();

        // Select all text
        const range = document.createRange();
        range.selectNodeContents(element);
        const selection = iframe?.contentWindow?.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);

        // Store data for later
        element._editData = {
            originalText,
            sourceInfo
        };

        // Handle blur to finish editing
        const finishHandler = () => {
            if (!isEditingText) return;

            const newText = element.textContent;
            const editData = element._editData;

            if (newText !== editData.originalText) {
                // Send text change to extension
                vscode.postMessage({
                    type: 'text-content-change',
                    lineNumber: editData.sourceInfo.lineNumber,
                    tagName: editData.sourceInfo.tagName,
                    elementIndex: editData.sourceInfo.elementIndex,
                    originalText: editData.originalText,
                    newText: newText
                });
            }

            finishInlineEditing();
        };

        element.addEventListener('blur', finishHandler, { once: true });

        // Handle Enter to finish editing
        const keyHandler = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                element.blur();
            }
        };
        element.addEventListener('keydown', keyHandler);
        element._keyHandler = keyHandler;
    }

    function finishInlineEditing() {
        if (!selectedElement) return;

        if (selectedElement._keyHandler) {
            selectedElement.removeEventListener('keydown', selectedElement._keyHandler);
        }
        selectedElement.removeAttribute('contenteditable');
        selectedElement.classList.remove('looks-good-editing');
        selectedElement.classList.add('looks-good-selected');
        delete selectedElement._editData;
        delete selectedElement._keyHandler;
        isEditingText = false;
    }

    function cancelInlineEditing() {
        if (!selectedElement || !selectedElement._editData) return;

        // Restore original text
        selectedElement.textContent = selectedElement._editData.originalText;
        finishInlineEditing();
    }

    function selectElement(element) {
        if (selectedElement) {
            selectedElement.classList.remove('looks-good-selected');
        }

        selectedElement = element;
        element.classList.add('looks-good-selected');
        element.classList.remove('looks-good-hover');

        updateElementInfo(element);
        updateCssPanel(element);

        const lineNumber = parseInt(element.getAttribute('data-lg-line') || '1');
        vscode.postMessage({
            type: 'element-selected',
            startLine: lineNumber,
            endLine: lineNumber,
            startColumn: 0,
            endColumn: 0
        });
    }

    function selectElementByLine(line, column) {
        const iframeDoc = iframe?.contentDocument;
        if (!iframeDoc) return;

        const element = iframeDoc.querySelector(`[data-lg-line="${line}"]`);
        if (element) {
            selectElement(element);
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    function updateElementInfo(element) {
        if (!elementInfo) return;

        let info = element.tagName.toLowerCase();
        if (element.id) {
            info += `#${element.id}`;
        }
        if (element.className && typeof element.className === 'string') {
            const classes = element.className.split(' ').filter(c => !c.startsWith('looks-good-'));
            if (classes.length > 0) {
                info += '.' + classes.join('.');
            }
        }

        elementInfo.textContent = info;
    }

    function updateCssPanel(element) {
        if (!cssProperties || !config.showCssPanel) return;

        const computedStyle = iframe?.contentWindow?.getComputedStyle(element);
        if (!computedStyle) return;

        const cssCategories = {
            'Layout': ['display', 'position', 'width', 'height', 'margin', 'padding'],
            'Typography': ['font-family', 'font-size', 'font-weight', 'line-height', 'text-align', 'color'],
            'Background': ['background-color', 'background-image'],
            'Border': ['border', 'border-radius'],
            'Spacing': ['gap', 'flex-direction', 'justify-content', 'align-items']
        };

        let html = '';

        for (const [category, properties] of Object.entries(cssCategories)) {
            html += `<div class="css-category">${category}</div>`;

            for (const prop of properties) {
                const value = computedStyle.getPropertyValue(prop);
                const isColor = prop.includes('color');

                if (isColor) {
                    html += `
            <div class="css-property">
              <span class="css-property-name">${prop}</span>
              <div class="css-property-color">
                <input type="color" value="${rgbToHex(value)}" data-property="${prop}">
                <input type="text" class="css-property-value" value="${value}" data-property="${prop}">
              </div>
            </div>`;
                } else {
                    html += `
            <div class="css-property">
              <span class="css-property-name">${prop}</span>
              <input type="text" class="css-property-value" value="${value}" data-property="${prop}">
            </div>`;
                }
            }
        }

        cssProperties.innerHTML = html;

        cssProperties.querySelectorAll('input').forEach(input => {
            input.addEventListener('change', (e) => {
                const target = e.target;
                const property = target.getAttribute('data-property');
                const value = target.value;

                if (property && selectedElement) {
                    selectedElement.style[property] = value;

                    const lineNumber = parseInt(selectedElement.getAttribute('data-lg-line') || '1');
                    vscode.postMessage({
                        type: 'css-property-change',
                        startLine: lineNumber,
                        endLine: lineNumber,
                        property: property,
                        value: value
                    });
                }
            });
        });
    }

    function rgbToHex(rgb) {
        if (rgb.startsWith('#')) return rgb;

        const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (match) {
            const r = parseInt(match[1]).toString(16).padStart(2, '0');
            const g = parseInt(match[2]).toString(16).padStart(2, '0');
            const b = parseInt(match[3]).toString(16).padStart(2, '0');
            return `#${r}${g}${b}`;
        }
        return '#000000';
    }

    // Clipboard operations
    let clipboardElement = null;
    let isCut = false;

    function copyElement(cut) {
        if (!selectedElement) return;

        clipboardElement = selectedElement.cloneNode(true);
        isCut = cut;

        if (cut) {
            selectedElement.classList.add('looks-good-dragging');
        }
    }

    function pasteElement() {
        if (!clipboardElement || !selectedElement) return;

        const iframeDoc = iframe?.contentDocument;
        if (!iframeDoc) return;

        const newElement = clipboardElement.cloneNode(true);
        newElement.classList.remove('looks-good-selected', 'looks-good-hover', 'looks-good-dragging');

        selectedElement.parentNode?.insertBefore(newElement, selectedElement.nextSibling);
        setupDragEvents(newElement, iframeDoc);

        if (isCut) {
            const originalElement = iframeDoc.querySelector('.looks-good-dragging');
            if (originalElement) {
                originalElement.remove();
            }
            clipboardElement = null;
            isCut = false;
        }
    }

    // Drag and drop with source code sync
    function setupDragEvents(element, doc) {
        element.setAttribute('draggable', 'true');

        element.addEventListener('dragstart', (e) => {
            if (isEditingText) {
                e.preventDefault();
                return;
            }
            isDragging = true;
            dragElement = e.target;
            e.target.classList.add('looks-good-dragging');
            e.dataTransfer.effectAllowed = 'move';

            // Store source info
            dragElement._dragSourceInfo = getElementSourceInfo(e.target);
        });

        element.addEventListener('dragend', (e) => {
            isDragging = false;
            e.target.classList.remove('looks-good-dragging');
            doc.querySelectorAll('.looks-good-drop-target').forEach(el => {
                el.classList.remove('looks-good-drop-target');
            });
            delete dragElement?._dragSourceInfo;
            dragElement = null;
        });

        element.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (e.target !== dragElement && e.target.hasAttribute('data-lg-id')) {
                e.target.classList.add('looks-good-drop-target');
            }
        });

        element.addEventListener('dragleave', (e) => {
            e.target.classList.remove('looks-good-drop-target');
        });

        element.addEventListener('drop', (e) => {
            e.preventDefault();
            e.target.classList.remove('looks-good-drop-target');

            if (dragElement && e.target !== dragElement && e.target.hasAttribute('data-lg-id')) {
                const sourceInfo = dragElement._dragSourceInfo;
                const targetInfo = getElementSourceInfo(e.target);

                // Determine drop position
                const rect = e.target.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;
                const insertBefore = e.clientY < midY;

                // Move in DOM
                if (insertBefore) {
                    e.target.parentNode?.insertBefore(dragElement, e.target);
                } else {
                    e.target.parentNode?.insertBefore(dragElement, e.target.nextSibling);
                }

                // Send move request to extension
                vscode.postMessage({
                    type: 'move-element',
                    source: {
                        lineNumber: sourceInfo.lineNumber,
                        tagName: sourceInfo.tagName,
                        elementIndex: sourceInfo.elementIndex
                    },
                    target: {
                        lineNumber: targetInfo.lineNumber,
                        tagName: targetInfo.tagName,
                        elementIndex: targetInfo.elementIndex
                    },
                    insertBefore: insertBefore
                });
            }
        });
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
