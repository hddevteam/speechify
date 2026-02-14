import * as path from 'path';
import Mocha from 'mocha';
import { glob } from 'glob';

export function run(): Promise<void> {
    // Prefer env var because VS Code may swallow arbitrary CLI args.
    const grepFromEnv = process.env.MOCHA_GREP;
    const grepIndex = process.argv.indexOf('--grep');
    const grepFromArgv = grepIndex > -1 ? process.argv[grepIndex + 1] : undefined;
    const grep = grepFromEnv || grepFromArgv;
    const testProfile = process.env.SPEECHIFY_TEST_PROFILE || 'stable';

    const excludedInStable = new Set([
        'extension.test.js',
        'videoAnalyzer.test.js',
        'refinement.test.js',
        'fullConversion.test.js',
        'refineScript.unit.test.js'
    ]);

    // Create the mocha test
    const mocha = new Mocha({
        ui: 'tdd',
        color: true,
        grep: grep ? new RegExp(grep) : undefined,
        timeout: 120000 // Increase timeout to 120s for AI API calls
    });

    const testsRoot = path.resolve(__dirname, '..');
    const sourceTestsRoot = path.resolve(__dirname, '../../../src/test/suite');

    return new Promise((c, e) => {
        Promise.all([
            glob('**/**.test.js', { cwd: testsRoot }),
            glob('**/**.test.ts', { cwd: sourceTestsRoot })
        ])
            .then(([compiledFiles, sourceFiles]: [string[], string[]]) => {
                const sourceTestBasenames = new Set(
                    sourceFiles.map((file) => path.basename(file).replace(/\.ts$/, '.js'))
                );

                const selectedFiles = compiledFiles.filter((file) => {
                    // Avoid stale compiled tests no longer present in src.
                    if (!sourceTestBasenames.has(path.basename(file))) {
                        return false;
                    }

                    if (grep) {
                        // When grep is used, do not hide files from the targeted run.
                        return true;
                    }

                    if (testProfile === 'full') {
                        return true;
                    }

                    return !excludedInStable.has(path.basename(file));
                });

                // Add files to the test suite
                selectedFiles.forEach((f: string) => mocha.addFile(path.resolve(testsRoot, f)));

                try {
                    // Run the mocha test
                    mocha.run((failures: number) => {
                        if (failures > 0) {
                            e(new Error(`${failures} tests failed.`));
                        } else {
                            c();
                        }
                    });
                } catch (err) {
                    console.error(err);
                    e(err);
                }
            })
            .catch(e);
    });
}
