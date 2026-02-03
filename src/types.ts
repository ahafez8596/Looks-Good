/**
 * Shared type definitions for the Looks Good extension
 */

/** Message types from extension to webview */
export interface UpdateContentMessage {
    type: 'update-content';
    html: string;
    baseUri: string;
}

export interface ZoomMessage {
    type: 'zoom';
    level: number;
}

export interface SelectElementMessage {
    type: 'select-element';
    line: number;
    column?: number;
}

export interface ConfigUpdateMessage {
    type: 'config-update';
    config: PreviewConfig;
}

export type ExtensionToWebviewMessage =
    | UpdateContentMessage
    | ZoomMessage
    | SelectElementMessage
    | ConfigUpdateMessage;

/** Message types from webview to extension */
export interface ElementSelectedMessage {
    type: 'element-selected';
    startLine: number;
    endLine: number;
    startColumn: number;
    endColumn: number;
}

export interface ApplyEditMessage {
    type: 'apply-edit';
    startLine: number;
    endLine: number;
    startColumn: number;
    endColumn: number;
    newContent: string;
}

export interface CssPropertyChangeMessage {
    type: 'css-property-change';
    startLine: number;
    endLine: number;
    property: string;
    value: string;
}

export interface DeleteElementMessage {
    type: 'delete-element';
    lineNumber: number;
    tagName: string;
    elementIndex: number;
    outerHtml: string;
}

export interface TextContentChangeMessage {
    type: 'text-content-change';
    lineNumber: number;
    tagName: string;
    elementIndex: number;
    originalText: string;
    newText: string;
}

export interface MoveElementMessage {
    type: 'move-element';
    source: {
        lineNumber: number;
        tagName: string;
        elementIndex: number;
    };
    target: {
        lineNumber: number;
        tagName: string;
        elementIndex: number;
    };
    insertBefore: boolean;
}

export interface TriggerUndoMessage {
    type: 'trigger-undo';
}

export interface TriggerRedoMessage {
    type: 'trigger-redo';
}

export interface RequestRefreshMessage {
    type: 'request-refresh';
}

export interface OpenDevToolsMessage {
    type: 'open-devtools';
}

export interface ReadyMessage {
    type: 'ready';
}

export interface ErrorMessage {
    type: 'error';
    message: string;
}

export type WebviewToExtensionMessage =
    | ElementSelectedMessage
    | ApplyEditMessage
    | CssPropertyChangeMessage
    | DeleteElementMessage
    | TextContentChangeMessage
    | MoveElementMessage
    | TriggerUndoMessage
    | TriggerRedoMessage
    | RequestRefreshMessage
    | OpenDevToolsMessage
    | ReadyMessage
    | ErrorMessage;

/** Preview configuration */
export interface PreviewConfig {
    autoRefresh: boolean;
    refreshDelay: number;
    defaultZoom: number;
    syncScroll: boolean;
    showCssPanel: boolean;
}

/** Element info for selection */
export interface ElementInfo {
    tagName: string;
    id?: string;
    className?: string;
    startLine: number;
    endLine: number;
    startColumn: number;
    endColumn: number;
}
