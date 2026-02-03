import * as vscode from 'vscode';
import { PreviewManager } from './previewManager';

let previewManager: PreviewManager | undefined;

export function activate(context: vscode.ExtensionContext) {
    console.log('Looks Good extension is now active!');

    // Initialize the preview manager
    previewManager = new PreviewManager(context);

    // Register commands
    const openPreviewCommand = vscode.commands.registerCommand(
        'looksGood.openPreview',
        () => {
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document.languageId === 'html') {
                previewManager?.showPreview(editor.document, vscode.ViewColumn.Active);
            } else {
                vscode.window.showWarningMessage('Looks Good: Please open an HTML file first.');
            }
        }
    );

    const openPreviewToSideCommand = vscode.commands.registerCommand(
        'looksGood.openPreviewToSide',
        () => {
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document.languageId === 'html') {
                previewManager?.showPreview(editor.document, vscode.ViewColumn.Beside);
            } else {
                vscode.window.showWarningMessage('Looks Good: Please open an HTML file first.');
            }
        }
    );

    const refreshCommand = vscode.commands.registerCommand(
        'looksGood.refresh',
        () => {
            previewManager?.refresh();
        }
    );

    const zoomInCommand = vscode.commands.registerCommand(
        'looksGood.zoomIn',
        () => {
            previewManager?.zoomIn();
        }
    );

    const zoomOutCommand = vscode.commands.registerCommand(
        'looksGood.zoomOut',
        () => {
            previewManager?.zoomOut();
        }
    );

    const resetZoomCommand = vscode.commands.registerCommand(
        'looksGood.resetZoom',
        () => {
            previewManager?.resetZoom();
        }
    );

    const openDevToolsCommand = vscode.commands.registerCommand(
        'looksGood.openDevTools',
        () => {
            // Opens VS Code's built-in WebView Developer Tools
            vscode.commands.executeCommand('workbench.action.webview.openDeveloperTools');
        }
    );

    // Register text document change listener
    const textChangeListener = vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.languageId === 'html') {
            previewManager?.onDocumentChange(event.document);
        }
    });

    // Register text editor selection change listener
    const selectionChangeListener = vscode.window.onDidChangeTextEditorSelection((event) => {
        if (event.textEditor.document.languageId === 'html') {
            previewManager?.onSelectionChange(event.textEditor, event.selections);
        }
    });

    // Register configuration change listener
    const configChangeListener = vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('looksGood')) {
            previewManager?.onConfigChange();
        }
    });

    // Add all disposables to context
    context.subscriptions.push(
        openPreviewCommand,
        openPreviewToSideCommand,
        refreshCommand,
        zoomInCommand,
        zoomOutCommand,
        resetZoomCommand,
        openDevToolsCommand,
        textChangeListener,
        selectionChangeListener,
        configChangeListener
    );
}

export function deactivate() {
    previewManager?.dispose();
    previewManager = undefined;
}
