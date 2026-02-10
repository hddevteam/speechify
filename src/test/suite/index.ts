import * as path from 'path';
import Mocha from 'mocha';
import { glob } from 'glob';

export function run(): Promise<void> {
    // Prefer env var because VS Code may swallow arbitrary CLI args.
    const grepFromEnv = process.env.MOCHA_GREP;
    const grepIndex = process.argv.indexOf('--grep');
    const grepFromArgv = grepIndex > -1 ? process.argv[grepIndex + 1] : undefined;
    const grep = grepFromEnv || grepFromArgv;

    // Create the mocha test
    const mocha = new Mocha({
        ui: 'tdd',
        color: true,
        grep: grep ? new RegExp(grep) : undefined,
        timeout: 120000 // Increase timeout to 120s for AI API calls
    });

    const testsRoot = path.resolve(__dirname, '..');

    return new Promise((c, e) => {
        glob('**/**.test.js', { cwd: testsRoot })
            .then((files: string[]) => {
                // Add files to the test suite
                files.forEach((f: string) => mocha.addFile(path.resolve(testsRoot, f)));

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
