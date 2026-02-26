export interface TextSourceUri {
    fsPath: string;
}

export interface ActiveEditorState {
    documentText: string;
    documentPath: string;
    hasSelection: boolean;
    selectionText: string;
    isTextLikeDocument: boolean;
}

export interface ResolveSpeechTextInput {
    uri?: TextSourceUri;
    uriDocumentText?: string;
    isTextLikeUri?: boolean;
    activeEditor?: ActiveEditorState;
    defaultSourceFilePath?: string;
}

export interface ResolveSpeechTextResult {
    text: string;
    sourceFilePath: string;
}

export function resolveSpeechText(input: ResolveSpeechTextInput): ResolveSpeechTextResult {
    const sourceFilePath = input.defaultSourceFilePath ?? 'headless_conv.txt';
    const uriPath = input.uri?.fsPath;
    const editor = input.activeEditor;

    if (editor && editor.hasSelection && editor.selectionText.trim()) {
        if (!uriPath || uriPath === editor.documentPath) {
            return {
                text: editor.selectionText,
                sourceFilePath: editor.documentPath
            };
        }
    }

    if (uriPath && input.isTextLikeUri && typeof input.uriDocumentText === 'string') {
        return {
            text: input.uriDocumentText,
            sourceFilePath: uriPath
        };
    }

    if (!editor) {
        return {
            text: '',
            sourceFilePath
        };
    }

    if (editor.hasSelection && editor.selectionText.trim()) {
        return {
            text: editor.selectionText,
            sourceFilePath: editor.documentPath
        };
    }

    if (editor.isTextLikeDocument) {
        return {
            text: editor.documentText,
            sourceFilePath: editor.documentPath
        };
    }

    return {
        text: '',
        sourceFilePath: editor.documentPath
    };
}