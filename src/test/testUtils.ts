import * as fs from 'fs';
import * as path from 'path';

/**
 * Test configuration interface
 */
export interface TestConfig {
  subscriptionKey: string;
  endpoint: string;
}

/**
 * Load test configuration from test-config.json
 */
export function loadTestConfig(): TestConfig {
  const configPath = path.join(__dirname, '../../../test-config.json');
  
  if (!fs.existsSync(configPath)) {
    throw new Error('Test configuration file not found. Please create test-config.json with Azure credentials.');
  }
  
  const configContent = fs.readFileSync(configPath, 'utf-8');
  const config = JSON.parse(configContent) as TestConfig;
  
  if (!config.subscriptionKey || !config.endpoint) {
    throw new Error('Invalid test configuration. Please ensure subscriptionKey and endpoint are provided.');
  }
  
  return config;
}

/**
 * Check if test configuration is available
 */
export function hasTestConfig(): boolean {
  const configPath = path.join(__dirname, '../../../test-config.json');
  return fs.existsSync(configPath);
}

/**
 * Create a temporary test file
 */
export function createTempFile(content: string, extension: string = '.txt'): string {
  const os = require('os');
  const tempDir = os.tmpdir();
  const fileName = `speechify-test-${Date.now()}${extension}`;
  const filePath = path.join(tempDir, fileName);
  
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

/**
 * Clean up temporary test file
 */
export function cleanupTempFile(filePath: string): void {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

/**
 * Get test data directory
 */
export function getTestDataDir(): string {
  return path.join(__dirname, 'data');
}

/**
 * Wait for a specified amount of time
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Test sample texts in different languages
 */
export const TEST_TEXTS = {
  english: {
    short: 'Hello world, this is a test.',
    medium: 'This is a medium length text for testing the Speechify extension. It should be long enough to test chunking but not too long to slow down tests.',
    long: 'This is a much longer text that will be used to test the chunking functionality of the Speechify extension. It contains multiple sentences and should be long enough to trigger the text splitting logic. The extension should be able to handle this text properly and generate multiple audio files if necessary. This text is designed to test the robustness of the speech synthesis system and ensure that it can handle various text lengths effectively.'
  },
  chinese: {
    short: '你好世界，这是一个测试。',
    medium: '这是一个中等长度的文本，用于测试 Speechify 扩展。它应该足够长以测试分块功能，但不会太长以至于减慢测试速度。',
    long: '这是一个更长的文本，将用于测试 Speechify 扩展的分块功能。它包含多个句子，应该足够长以触发文本分割逻辑。扩展应该能够正确处理此文本并在必要时生成多个音频文件。此文本旨在测试语音合成系统的鲁棒性，并确保它可以有效地处理各种文本长度。中文文本具有不同的特征，需要特别的处理和测试。'
  },
  markdown: `# Test Markdown Document

This is a **test markdown** document with various elements:

- Bullet point 1
- Bullet point 2
- Bullet point 3

## Code Example

\`\`\`javascript
const test = "Hello World";
console.log(test);
\`\`\`

> This is a blockquote for testing.

The extension should extract only the readable text from this markdown.`
};

/**
 * Expected voice configurations for testing
 */
export const TEST_VOICES = {
  english: {
    name: 'en-US-JennyNeural',
    gender: 'Female',
    locale: 'en-US'
  },
  chinese: {
    name: 'zh-CN-XiaoxiaoNeural',
    gender: 'Female', 
    locale: 'zh-CN'
  }
};
