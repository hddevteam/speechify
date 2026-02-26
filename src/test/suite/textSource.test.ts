import * as assert from 'assert';
import { resolveSpeechText } from '../../utils/textSource';

suite('resolveSpeechText', () => {
    test('uses selected text when there is a non-empty selection in active editor', () => {
        const result = resolveSpeechText({
            uriDocumentText: 'FULL_TEXT',
            uri: { fsPath: '/tmp/test.md' },
            activeEditor: {
                documentText: 'FULL_TEXT',
                documentPath: '/tmp/test.md',
                hasSelection: true,
                selectionText: 'SELECTED_TEXT',
                isTextLikeDocument: true
            },
            isTextLikeUri: true
        });

        assert.strictEqual(result.text, 'SELECTED_TEXT');
        assert.strictEqual(result.sourceFilePath, '/tmp/test.md');
    });

    test('falls back to whole document when no selection in active editor', () => {
        const result = resolveSpeechText({
            activeEditor: {
                documentText: 'FULL_FROM_EDITOR',
                documentPath: '/tmp/editor.md',
                hasSelection: false,
                selectionText: '',
                isTextLikeDocument: true
            }
        });

        assert.strictEqual(result.text, 'FULL_FROM_EDITOR');
        assert.strictEqual(result.sourceFilePath, '/tmp/editor.md');
    });

    test('uses whole file text when triggered from file name context and no selection', () => {
        const result = resolveSpeechText({
            uriDocumentText: 'FULL_FROM_URI',
            uri: { fsPath: '/tmp/from-explorer.txt' },
            isTextLikeUri: true,
            activeEditor: {
                documentText: 'OTHER_EDITOR_TEXT',
                documentPath: '/tmp/other.md',
                hasSelection: false,
                selectionText: '',
                isTextLikeDocument: true
            }
        });

        assert.strictEqual(result.text, 'FULL_FROM_URI');
        assert.strictEqual(result.sourceFilePath, '/tmp/from-explorer.txt');
    });

    test('uses uri file text when active selection is from another file', () => {
        const result = resolveSpeechText({
            uriDocumentText: 'FULL_FROM_EXPLORER_FILE',
            uri: { fsPath: '/tmp/explorer.txt' },
            isTextLikeUri: true,
            activeEditor: {
                documentText: 'EDITOR_FILE_TEXT',
                documentPath: '/tmp/editor.md',
                hasSelection: true,
                selectionText: 'EDITOR_SELECTED_TEXT',
                isTextLikeDocument: true
            }
        });

        assert.strictEqual(result.text, 'FULL_FROM_EXPLORER_FILE');
        assert.strictEqual(result.sourceFilePath, '/tmp/explorer.txt');
    });
});