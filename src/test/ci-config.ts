/**
 * CI-specific test configuration
 * This file contains settings optimized for GitHub Actions and other CI environments
 */

export const CI_CONFIG = {
    // Increase timeouts for CI environment
    timeouts: {
        activation: 15000,      // 15 seconds for extension activation
        command: 10000,         // 10 seconds for command execution
        default: 5000           // 5 seconds for regular tests
    },
    
    // Skip tests that require local resources
    skipTests: {
        azureApi: !process.env.AZURE_SPEECH_KEY,           // Skip if no Azure key
        fileOperations: process.env.CI === 'true',         // Skip complex file ops in CI
        interactiveCommands: process.env.CI === 'true'     // Skip commands requiring UI
    },
    
    // Environment detection
    isCI: process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true',
    isLocal: !process.env.CI && !process.env.GITHUB_ACTIONS,
    
    // Mock configuration for CI environment
    mockConfig: {
        azureKey: 'mock-azure-key-for-testing',
        region: 'eastus',
        voiceName: 'en-US-AriaNeural'
    }
};

/**
 * Check if we're running in CI environment
 */
export function isRunningInCI(): boolean {
    return CI_CONFIG.isCI;
}

/**
 * Get appropriate timeout for test type
 */
export function getTimeout(type: 'activation' | 'command' | 'default'): number {
    return CI_CONFIG.timeouts[type];
}

/**
 * Check if a test should be skipped in current environment
 */
export function shouldSkipTest(testType: keyof typeof CI_CONFIG.skipTests): boolean {
    return CI_CONFIG.skipTests[testType];
}
