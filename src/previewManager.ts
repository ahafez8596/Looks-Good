import * as vscode from 'vscode';
import * as path from 'path';
import {
    PreviewConfig,
    ExtensionToWebviewMessage,
    WebviewToExtensionMessage,
    ElementSelectedMessage,
    ApplyEditMessage,
    CssPropertyChangeMessage,
    DeleteElementMessage,
    TextContentChangeMessage,
    MoveElementMessage
} from './types';

export class PreviewManager {
    private panel: vscode.WebviewPanel | undefined;
    private currentDocument: vscode.TextDocument | undefined;
    private context: vscode.ExtensionContext;
    private updateTimeout: NodeJS.Timeout | undefined;
    private zoomLevel: number = 100;
    private disposables: vscode.Disposable[] = [];

    private selectionFromWebview: boolean = false;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.zoomLevel = this.getConfig().defaultZoom;
    }

    private getConfig(): PreviewConfig {
        const config = vscode.workspace.getConfiguration('looksGood');
        return {
            autoRefresh: config.get<boolean>('autoRefresh', true),
            refreshDelay: config.get<number>('refreshDelay', 100),
            defaultZoom: config.get<number>('defaultZoom', 100),
            syncScroll: config.get<boolean>('syncScroll', true),
            showCssPanel: config.get<boolean>('showCssPanel', true)
        };
    }

    public showPreview(document: vscode.TextDocument, column: vscode.ViewColumn): void {
        this.currentDocument = document;

        if (this.panel) {
            this.panel.reveal(column);
            this.updateContent();
        } else {
            this.panel = vscode.window.createWebviewPanel(
                'looksGoodPreview',
                `Preview: ${path.basename(document.fileName)}`,
                column,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: [
                        vscode.Uri.file(path.dirname(document.fileName)),
                        vscode.Uri.joinPath(this.context.extensionUri, 'media')
                    ]
                }
            );

            this.panel.webview.onDidReceiveMessage(
                (message: WebviewToExtensionMessage) => this.handleMessage(message),
                undefined,
                this.disposables
            );

            this.panel.onDidDispose(
                () => {
                    this.panel = undefined;
                    this.currentDocument = undefined;
                },
                undefined,
                this.disposables
            );

            vscode.commands.executeCommand('setContext', 'looksGoodPreviewFocus', true);

            this.panel.onDidChangeViewState(
                (e) => {
                    vscode.commands.executeCommand('setContext', 'looksGoodPreviewFocus', e.webviewPanel.active);
                },
                undefined,
                this.disposables
            );

            this.panel.webview.html = this.getWebviewContent();
        }
    }

    private handleMessage(message: WebviewToExtensionMessage): void {
        switch (message.type) {
            case 'ready':
                this.updateContent();
                break;

            case 'element-selected':
                this.handleElementSelected(message);
                break;

            case 'apply-edit':
                this.handleApplyEdit(message);
                break;

            case 'css-property-change':
                this.handleCssPropertyChange(message);
                break;

            case 'delete-element':
                this.handleDeleteElement(message);
                break;

            case 'text-content-change':
                this.handleTextContentChange(message);
                break;

            case 'move-element':
                this.handleMoveElement(message);
                break;

            case 'trigger-undo':
                this.triggerUndo();
                break;

            case 'trigger-redo':
                this.triggerRedo();
                break;

            case 'request-refresh':
                this.updateContent();
                break;

            case 'open-devtools':
                vscode.commands.executeCommand('workbench.action.webview.openDeveloperTools');
                break;

            case 'error':
                vscode.window.showErrorMessage(`Looks Good: ${message.message}`);
                break;
        }
    }

    private async triggerUndo(): Promise<void> {
        // Focus the correct editor before undoing
        const editor = vscode.window.visibleTextEditors.find(
            e => e.document === this.currentDocument
        );

        if (editor) {
            // Show the editor to make it active
            await vscode.window.showTextDocument(editor.document, editor.viewColumn);
            // Execute undo
            await vscode.commands.executeCommand('undo');
            // Refresh preview to show changes
            setTimeout(() => this.updateContent(), 100);
        }
    }

    private async triggerRedo(): Promise<void> {
        // Focus the correct editor before redoing
        const editor = vscode.window.visibleTextEditors.find(
            e => e.document === this.currentDocument
        );

        if (editor) {
            // Show the editor to make it active
            await vscode.window.showTextDocument(editor.document, editor.viewColumn);
            // Execute redo
            await vscode.commands.executeCommand('redo');
            // Refresh preview to show changes
            setTimeout(() => this.updateContent(), 100);
        }
    }

    private handleElementSelected(message: ElementSelectedMessage): void {
        if (!this.currentDocument) return;

        this.selectionFromWebview = true;

        const startPos = new vscode.Position(message.startLine - 1, message.startColumn);
        const endPos = new vscode.Position(message.endLine - 1, message.endColumn);
        const selection = new vscode.Selection(startPos, endPos);

        const editor = vscode.window.visibleTextEditors.find(
            e => e.document === this.currentDocument
        );

        if (editor) {
            editor.selection = selection;
            editor.revealRange(selection, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
        }

        setTimeout(() => {
            this.selectionFromWebview = false;
        }, 100);
    }

    private async handleApplyEdit(message: ApplyEditMessage): Promise<void> {
        if (!this.currentDocument) return;

        const startPos = new vscode.Position(message.startLine - 1, message.startColumn);
        const endPos = new vscode.Position(message.endLine - 1, message.endColumn);
        const range = new vscode.Range(startPos, endPos);

        const edit = new vscode.WorkspaceEdit();
        edit.replace(this.currentDocument.uri, range, message.newContent);
        await vscode.workspace.applyEdit(edit);
    }

    private async handleDeleteElement(message: DeleteElementMessage): Promise<void> {
        if (!this.currentDocument) return;

        const lineIdx = message.lineNumber - 1;
        const fullText = this.currentDocument.getText();
        const lines = fullText.split('\n');

        if (lineIdx >= lines.length || lineIdx < 0) return;

        // Find the nth occurrence of this tag on this line
        const line = lines[lineIdx];
        const tagRegex = new RegExp(`<${message.tagName}[\\s>]`, 'gi');
        let match;
        let occurrenceCount = 0;
        let tagStartIndex = -1;

        while ((match = tagRegex.exec(line)) !== null) {
            if (occurrenceCount === message.elementIndex) {
                tagStartIndex = match.index;
                break;
            }
            occurrenceCount++;
        }

        if (tagStartIndex === -1) return;

        // Find the full element (opening tag to closing tag)
        const { startLine, startCol, endLine, endCol } = this.findElementBoundaries(
            lines, lineIdx, tagStartIndex, message.tagName
        );

        // Delete the element
        const startPos = new vscode.Position(startLine, startCol);
        const endPos = new vscode.Position(endLine, endCol);
        const range = new vscode.Range(startPos, endPos);

        const edit = new vscode.WorkspaceEdit();
        edit.delete(this.currentDocument.uri, range);
        await vscode.workspace.applyEdit(edit);
    }

    private async handleTextContentChange(message: TextContentChangeMessage): Promise<void> {
        if (!this.currentDocument) return;

        const lineIdx = message.lineNumber - 1;
        const fullText = this.currentDocument.getText();
        const lines = fullText.split('\n');

        if (lineIdx >= lines.length || lineIdx < 0) return;

        // Find the nth occurrence of this tag on this line
        const line = lines[lineIdx];
        const tagRegex = new RegExp(`<${message.tagName}[^>]*>`, 'gi');
        let match;
        let occurrenceCount = 0;
        let tagEndIndex = -1;

        while ((match = tagRegex.exec(line)) !== null) {
            if (occurrenceCount === message.elementIndex) {
                tagEndIndex = match.index + match[0].length;
                break;
            }
            occurrenceCount++;
        }

        if (tagEndIndex === -1) return;

        // Find the closing tag
        const closingTag = `</${message.tagName}>`;
        const closingIndex = line.indexOf(closingTag, tagEndIndex);

        if (closingIndex === -1) {
            // Text might span multiple lines - for now just handle single line
            return;
        }

        // Replace the text content
        const textStart = tagEndIndex;
        const textEnd = closingIndex;

        const startPos = new vscode.Position(lineIdx, textStart);
        const endPos = new vscode.Position(lineIdx, textEnd);
        const range = new vscode.Range(startPos, endPos);

        const edit = new vscode.WorkspaceEdit();
        edit.replace(this.currentDocument.uri, range, message.newText);
        await vscode.workspace.applyEdit(edit);
    }

    private async handleMoveElement(message: MoveElementMessage): Promise<void> {
        if (!this.currentDocument) return;

        const fullText = this.currentDocument.getText();
        const lines = fullText.split('\n');

        // Find source element
        const sourceLineIdx = message.source.lineNumber - 1;
        if (sourceLineIdx >= lines.length || sourceLineIdx < 0) return;

        const sourceLine = lines[sourceLineIdx];
        const sourceTagRegex = new RegExp(`<${message.source.tagName}[\\s>]`, 'gi');
        let match;
        let occurrenceCount = 0;
        let sourceTagStart = -1;

        while ((match = sourceTagRegex.exec(sourceLine)) !== null) {
            if (occurrenceCount === message.source.elementIndex) {
                sourceTagStart = match.index;
                break;
            }
            occurrenceCount++;
        }

        if (sourceTagStart === -1) return;

        // Get source element boundaries
        const sourceBounds = this.findElementBoundaries(
            lines, sourceLineIdx, sourceTagStart, message.source.tagName
        );

        // Extract source element content
        const sourceStartPos = new vscode.Position(sourceBounds.startLine, sourceBounds.startCol);
        const sourceEndPos = new vscode.Position(sourceBounds.endLine, sourceBounds.endCol);
        const sourceRange = new vscode.Range(sourceStartPos, sourceEndPos);
        const sourceContent = this.currentDocument.getText(sourceRange);

        // Find target element
        const targetLineIdx = message.target.lineNumber - 1;
        if (targetLineIdx >= lines.length || targetLineIdx < 0) return;

        const targetLine = lines[targetLineIdx];
        const targetTagRegex = new RegExp(`<${message.target.tagName}[\\s>]`, 'gi');
        let targetMatch;
        let targetOccurrence = 0;
        let targetTagStart = -1;

        while ((targetMatch = targetTagRegex.exec(targetLine)) !== null) {
            if (targetOccurrence === message.target.elementIndex) {
                targetTagStart = targetMatch.index;
                break;
            }
            targetOccurrence++;
        }

        if (targetTagStart === -1) return;

        // Get target element boundaries
        const targetBounds = this.findElementBoundaries(
            lines, targetLineIdx, targetTagStart, message.target.tagName
        );

        // Determine insert position
        let insertLine: number;
        let insertCol: number;

        if (message.insertBefore) {
            insertLine = targetBounds.startLine;
            insertCol = targetBounds.startCol;
        } else {
            insertLine = targetBounds.endLine;
            insertCol = targetBounds.endCol;
        }

        // Apply edits: first insert, then delete
        // We need to be careful with the order to maintain correct positions
        const edit = new vscode.WorkspaceEdit();

        // If source comes before target, delete first then insert
        if (sourceBounds.startLine < insertLine ||
            (sourceBounds.startLine === insertLine && sourceBounds.startCol < insertCol)) {
            // Delete source first
            edit.delete(this.currentDocument.uri, sourceRange);

            // Adjust insert position since we deleted before it
            const deletedLines = sourceBounds.endLine - sourceBounds.startLine;
            const adjustedInsertLine = insertLine - deletedLines;

            if (deletedLines === 0 && insertLine === sourceBounds.startLine) {
                // Same line - adjust column
                const deletedChars = sourceBounds.endCol - sourceBounds.startCol;
                const adjustedInsertCol = insertCol - deletedChars;
                edit.insert(this.currentDocument.uri, new vscode.Position(adjustedInsertLine, adjustedInsertCol), sourceContent);
            } else {
                edit.insert(this.currentDocument.uri, new vscode.Position(adjustedInsertLine, insertCol), sourceContent);
            }
        } else {
            // Insert first, then delete
            edit.insert(this.currentDocument.uri, new vscode.Position(insertLine, insertCol), sourceContent);
            edit.delete(this.currentDocument.uri, sourceRange);
        }

        await vscode.workspace.applyEdit(edit);
    }

    private findElementBoundaries(
        lines: string[],
        lineIdx: number,
        tagStartIndex: number,
        tagName: string
    ): { startLine: number; startCol: number; endLine: number; endCol: number } {
        const line = lines[lineIdx];

        // Check for self-closing tag
        const tagEnd = line.indexOf('>', tagStartIndex);
        if (tagEnd !== -1 && line[tagEnd - 1] === '/') {
            return {
                startLine: lineIdx,
                startCol: tagStartIndex,
                endLine: lineIdx,
                endCol: tagEnd + 1
            };
        }

        // Check if closing tag is on the same line
        const closingTag = `</${tagName}>`;
        const closingIndex = line.toLowerCase().indexOf(closingTag.toLowerCase(), tagEnd);
        if (closingIndex !== -1) {
            return {
                startLine: lineIdx,
                startCol: tagStartIndex,
                endLine: lineIdx,
                endCol: closingIndex + closingTag.length
            };
        }

        // Look for closing tag on subsequent lines
        let depth = 1;
        for (let i = lineIdx + 1; i < lines.length && depth > 0; i++) {
            const currentLine = lines[i].toLowerCase();

            // Count opening tags (not self-closing)
            const openRegex = new RegExp(`<${tagName.toLowerCase()}[\\s>](?![^>]*/>)`, 'gi');
            let openMatch;
            while ((openMatch = openRegex.exec(currentLine)) !== null) {
                depth++;
            }

            // Count closing tags
            const closeRegex = new RegExp(`</${tagName.toLowerCase()}>`, 'gi');
            let closeMatch;
            while ((closeMatch = closeRegex.exec(currentLine)) !== null) {
                depth--;
                if (depth === 0) {
                    return {
                        startLine: lineIdx,
                        startCol: tagStartIndex,
                        endLine: i,
                        endCol: closeMatch.index + closingTag.length
                    };
                }
            }
        }

        // Fallback: just the opening tag line
        return {
            startLine: lineIdx,
            startCol: tagStartIndex,
            endLine: lineIdx,
            endCol: line.length
        };
    }

    private async handleCssPropertyChange(message: CssPropertyChangeMessage): Promise<void> {
        if (!this.currentDocument) return;

        const fullText = this.currentDocument.getText();
        const lines = fullText.split('\n');

        const targetLine = message.startLine - 1;
        if (targetLine >= lines.length || targetLine < 0) return;

        let tagStartLine = targetLine;
        let foundTag = false;

        for (let i = targetLine; i >= 0 && !foundTag; i--) {
            const line = lines[i];
            const tagMatch = line.match(/<(\w+)([^>]*?)>/);
            if (tagMatch) {
                tagStartLine = i;
                foundTag = true;
                break;
            }
        }

        if (!foundTag) return;

        const line = lines[tagStartLine];

        const styleRegex = /style\s*=\s*["']([^"']*)["']/i;
        const styleMatch = line.match(styleRegex);

        let newLine: string;

        if (styleMatch) {
            const existingStyles = styleMatch[1];
            const propRegex = new RegExp(`${message.property}\\s*:\\s*[^;]+;?\\s*`, 'gi');
            let cleanedStyles = existingStyles.replace(propRegex, '').trim();

            cleanedStyles = cleanedStyles.replace(/;+\s*$/, '').replace(/^\s*;+/, '').trim();

            const newStyle = cleanedStyles
                ? `${cleanedStyles}; ${message.property}: ${message.value}`
                : `${message.property}: ${message.value}`;

            newLine = line.replace(styleRegex, `style="${newStyle}"`);
        } else {
            const tagNameMatch = line.match(/<(\w+)/);
            if (tagNameMatch) {
                const insertIndex = line.indexOf(tagNameMatch[0]) + tagNameMatch[0].length;
                newLine = line.slice(0, insertIndex) + ` style="${message.property}: ${message.value};"` + line.slice(insertIndex);
            } else {
                return;
            }
        }

        const lineStart = new vscode.Position(tagStartLine, 0);
        const lineEnd = new vscode.Position(tagStartLine, line.length);
        const range = new vscode.Range(lineStart, lineEnd);

        const edit = new vscode.WorkspaceEdit();
        edit.replace(this.currentDocument.uri, range, newLine);
        await vscode.workspace.applyEdit(edit);
    }

    private updateContent(): void {
        if (!this.panel || !this.currentDocument) return;

        const html = this.currentDocument.getText();
        const baseUri = this.panel.webview.asWebviewUri(
            vscode.Uri.file(path.dirname(this.currentDocument.fileName))
        ).toString();

        this.postMessage({
            type: 'update-content',
            html,
            baseUri
        });
    }

    public onDocumentChange(document: vscode.TextDocument): void {
        if (document !== this.currentDocument) return;

        const config = this.getConfig();
        if (!config.autoRefresh) return;

        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
        }

        this.updateTimeout = setTimeout(() => {
            this.updateContent();
        }, config.refreshDelay);
    }

    public onSelectionChange(editor: vscode.TextEditor, selections: readonly vscode.Selection[]): void {
        if (this.selectionFromWebview) return;

        if (editor.document !== this.currentDocument || !this.panel) return;
        if (selections.length === 0) return;

        if (!this.panel.active) return;

        const selection = selections[0];
        this.postMessage({
            type: 'select-element',
            line: selection.start.line + 1,
            column: selection.start.character
        });
    }

    public onConfigChange(): void {
        if (!this.panel) return;

        this.postMessage({
            type: 'config-update',
            config: this.getConfig()
        });
    }

    public refresh(): void {
        this.updateContent();
    }

    public zoomIn(): void {
        this.zoomLevel = Math.min(400, this.zoomLevel + 25);
        this.postMessage({ type: 'zoom', level: this.zoomLevel });
    }

    public zoomOut(): void {
        this.zoomLevel = Math.max(25, this.zoomLevel - 25);
        this.postMessage({ type: 'zoom', level: this.zoomLevel });
    }

    public resetZoom(): void {
        this.zoomLevel = this.getConfig().defaultZoom;
        this.postMessage({ type: 'zoom', level: this.zoomLevel });
    }

    private postMessage(message: ExtensionToWebviewMessage): void {
        this.panel?.webview.postMessage(message);
    }

    private getWebviewContent(): string {
        const styleUri = this.panel!.webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'preview.css')
        );
        const scriptUri = this.panel!.webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'preview.js')
        );

        const nonce = this.getNonce();
        const config = this.getConfig();

        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="
    default-src 'none';
    style-src ${this.panel!.webview.cspSource} 'unsafe-inline';
    script-src 'nonce-${nonce}';
    img-src ${this.panel!.webview.cspSource} https: data:;
    font-src ${this.panel!.webview.cspSource};
    frame-src blob:;
  ">
  <link href="${styleUri}" rel="stylesheet">
  <title>Looks Good Preview</title>
</head>
<body>
  <div class="toolbar">
    <div class="toolbar-group">
      <button id="btn-refresh" title="Refresh (Ctrl+R)">
        <span class="codicon codicon-refresh"></span> Refresh
      </button>
    </div>
    <div class="toolbar-group">
      <button id="btn-undo" title="Undo (Ctrl+Z)">↩ Undo</button>
      <button id="btn-redo" title="Redo (Ctrl+Y)">↪ Redo</button>
    </div>
    <div class="toolbar-group">
      <button id="btn-zoom-out" title="Zoom Out (Ctrl+-)">−</button>
      <span id="zoom-level">100%</span>
      <button id="btn-zoom-in" title="Zoom In (Ctrl+=)">+</button>
      <button id="btn-zoom-reset" title="Reset Zoom (Ctrl+0)">Reset</button>
    </div>
    <div class="toolbar-group">
      <button id="btn-devtools" title="Open DevTools (F12)">🔧 DevTools</button>
    </div>
    <div class="toolbar-group element-info" id="element-info">
      <span class="element-tag"></span>
    </div>
  </div>
  
  <div class="preview-container">
    <div class="preview-frame" id="preview-frame">
      <div id="preview-content"></div>
    </div>
    
    <div class="css-panel" id="css-panel" style="display: ${config.showCssPanel ? 'flex' : 'none'};">
      <div class="css-panel-header">
        <span>CSS Properties</span>
        <button id="btn-close-css" title="Close">×</button>
      </div>
      <div class="css-panel-content" id="css-properties">
        <p class="no-selection">Select an element to edit its styles</p>
      </div>
    </div>
  </div>

  <script nonce="${nonce}">
    window.initialConfig = ${JSON.stringify(config)};
  </script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }

    private getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    public dispose(): void {
        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
        }
        this.panel?.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}
