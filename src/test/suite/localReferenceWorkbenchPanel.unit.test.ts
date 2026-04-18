import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('Local Reference Workbench Layout', () => {
  test('should allow whole-page scrolling instead of trapping scroll inside provider cards', () => {
    const cssPath = path.resolve(__dirname, '../../../media/local-reference-workbench.css');
    const css = fs.readFileSync(cssPath, 'utf8');

    assert.ok(css.includes('body {\n  margin: 0;\n  min-height: 100vh;\n  overflow-y: auto;'));
    assert.ok(!css.includes('.cards {\n  min-height: 0;'));
    assert.ok(!css.includes('overflow: auto;'));
  });

  test('should give the selected target button a high-contrast active state', () => {
    const cssPath = path.resolve(__dirname, '../../../media/local-reference-workbench.css');
    const css = fs.readFileSync(cssPath, 'utf8');

    assert.ok(css.includes('.target-btn.is-active {'));
    assert.ok(css.includes('background: linear-gradient(135deg, #ff9a4a, #ff6a00);'));
    assert.ok(css.includes('border-color: rgba(255, 223, 194, 0.96);'));
  });

  test('should style submit buttons as active primary actions instead of muted gray buttons', () => {
    const cssPath = path.resolve(__dirname, '../../../media/local-reference-workbench.css');
    const css = fs.readFileSync(cssPath, 'utf8');

    assert.ok(css.includes('.field-save-btn {'));
    assert.ok(css.includes('background: linear-gradient(135deg, #ff9a4a, #ff6a00);'));
    assert.ok(css.includes('cursor: pointer;'));
  });

  test('should submit workbench edits through save-field messages instead of legacy provider actions', () => {
    const scriptPath = path.resolve(__dirname, '../../../media/local-reference-workbench.js');
    const script = fs.readFileSync(scriptPath, 'utf8');

    assert.ok(script.includes("type: 'save-field'"));
    assert.ok(!script.includes("type: 'run-provider-action'"));
    assert.ok(!script.includes('provider.details.map'));
  });
});
