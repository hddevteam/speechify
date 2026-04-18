import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('Local Reference Workbench Layout', () => {
  test('should use VS Code native CSS tokens instead of hardcoded colors', () => {
    const cssPath = path.resolve(__dirname, '../../../media/local-reference-workbench.css');
    const css = fs.readFileSync(cssPath, 'utf8');

    assert.ok(css.includes('--vscode-button-background'), 'should reference VS Code button token');
    assert.ok(css.includes('--vscode-focusBorder'), 'should reference VS Code focus border token');
    assert.ok(!css.includes('#ff9a4a'), 'should not contain hardcoded orange gradient color');
    assert.ok(!css.includes('#ff6a00'), 'should not contain hardcoded orange gradient end color');
  });

  test('should include recording widget styles with status-badge variants', () => {
    const cssPath = path.resolve(__dirname, '../../../media/local-reference-workbench.css');
    const css = fs.readFileSync(cssPath, 'utf8');

    assert.ok(css.includes('.status-badge'), 'should have status-badge class');
    assert.ok(css.includes('.status-badge.recording'), 'should have recording state style');
    assert.ok(css.includes('.status-badge.ready'), 'should have ready state style');
    assert.ok(css.includes('.pulse'), 'should have pulse animation element');
    assert.ok(css.includes('.recorder-actions'), 'should have recorder actions layout');
  });

  test('should style submit buttons using VS Code button background variable', () => {
    const cssPath = path.resolve(__dirname, '../../../media/local-reference-workbench.css');
    const css = fs.readFileSync(cssPath, 'utf8');

    assert.ok(css.includes('.field-save-btn {'), 'should have field-save-btn rule');
    assert.ok(css.includes('var(--vscode-button-background)'), 'should use VS Code button token for field save btn');
    assert.ok(css.includes('cursor: pointer;'), 'should have pointer cursor');
  });

  test('should submit workbench edits through save-field messages instead of legacy provider actions', () => {
    const scriptPath = path.resolve(__dirname, '../../../media/local-reference-workbench.js');
    const script = fs.readFileSync(scriptPath, 'utf8');

    assert.ok(script.includes("type: 'save-field'"), 'should post save-field messages');
    assert.ok(script.includes("type: 'start-recording'"), 'should post start-recording messages');
    assert.ok(script.includes("type: 'save-recording'"), 'should post save-recording messages');
    assert.ok(!script.includes("type: 'run-provider-action'"), 'should not use legacy run-provider-action');
    assert.ok(!script.includes("type: 'run-action'"), 'should not use legacy run-action message type');
  });
});
