const vscode = require('vscode');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const { marked } = require('marked'); // 引入 marked 库

function extractTextFromMarkdown(markdown) {
    // 使用正则表达式去掉代码块和行内代码
    const noCodeMarkdown = markdown
        .replace(/```[\s\S]*?```/g, '') // 去掉代码块
    // .replace(/`([^`]+)`/g, ''); // 去掉行内代码

    const html = marked(noCodeMarkdown); // 将去掉代码段的 Markdown 转换为 HTML
    const text = html.replace(/<[^>]*>/g, ''); // 移除 HTML 标签
    return text.trim(); // 去掉多余的空格
}

let voiceList = [];
const voiceListPath = path.join(__dirname, 'voice-list.json');

// Load voice-list.json file
function loadVoiceList() {
    try {
        const data = fs.readFileSync(voiceListPath, 'utf-8');
        voiceList = JSON.parse(data);
        console.log("Voice list loaded successfully");
    } catch (error) {
        console.error("Error loading voice list: ", error);
    }
}

loadVoiceList();

function getVoiceAttributes() {
    let config = vscode.workspace.getConfiguration('speechify');
    return {
        name: config.get('voiceName'),
        gender: config.get('voiceGender'),
        style: config.get('voiceStyle')
    };
}

// Function to create quick pick items for dropdown lists
function createQuickPickItems(attribute, list, defaultValue) {
    const seen = new Set();
    const filteredList = list.filter(item => {
        if (seen.has(item[attribute])) {
            return false;
        }
        seen.add(item[attribute]);
        return true;
    });

    const items = filteredList.map(item => ({
        label: item[attribute],
        description: attribute === 'ShortName' || attribute === 'Style' ? item.LocalName : ''
    }));

    // Move defaultValue to the top if it exists
    if (defaultValue) {
        const defaultIndex = items.findIndex(item => item.label === defaultValue);
        if (defaultIndex !== -1) {
            const [defaultItem] = items.splice(defaultIndex, 1);
            items.unshift(defaultItem);
        }
    }

    return items;
}

// Function to show dropdowns and get the user selections
async function configureSpeechifyVoiceSettings() {
    const config = getVoiceAttributes();
    const defaultVoice = voiceList.find(voice => voice.ShortName === config.name);

    if (!defaultVoice) {
        vscode.window.showErrorMessage('Default voice not found in the voice list.');
        return;
    }

    console.log('defaultVoice:', defaultVoice);
    console.log('defaultVoice.LocaleName:', defaultVoice.LocaleName);

    // Select LocaleName
    let localeNamePick;
    const localeNameItems = createQuickPickItems('LocaleName', voiceList, defaultVoice.LocaleName);
    if (localeNameItems.length === 1) {
        localeNamePick = localeNameItems[0];
    } else if (localeNameItems.length > 1) {
        localeNamePick = await vscode.window.showQuickPick(localeNameItems, {
            placeHolder: 'Select Locale Name'
        });
    }

    if (!localeNamePick) return;

    const selectedVoicesByLocale = voiceList.filter(voice => voice.LocaleName === localeNamePick.label);

    // Select Gender
    let genderPick;
    const genderItems = createQuickPickItems('Gender', selectedVoicesByLocale, defaultVoice.Gender);
    if (genderItems.length === 1) {
        genderPick = genderItems[0];
    } else if (genderItems.length > 1) {
        genderPick = await vscode.window.showQuickPick(genderItems, {
            placeHolder: 'Select Gender'
        });
    }

    if (!genderPick) return;

    const selectedVoicesByGender = selectedVoicesByLocale.filter(voice => voice.Gender === genderPick.label);

    // Select ShortName
    let shortNamePick;
    const shortNameItems = createQuickPickItems('ShortName', selectedVoicesByGender, defaultVoice.ShortName);
    if (shortNameItems.length === 1) {
        shortNamePick = shortNameItems[0];
    } else if (shortNameItems.length > 1) {
        shortNamePick = await vscode.window.showQuickPick(shortNameItems, {
            placeHolder: 'Select Voice'
        });
    }

    if (!shortNamePick) return;

    // Find the selected voice to get its StyleList
    const selectedVoice = selectedVoicesByGender.find(voice => voice.ShortName === shortNamePick.label);
    if (!selectedVoice) return;

    // Select Style
    let stylePick;
    const styleItems = selectedVoice.StyleList?.map(style => ({
        label: style,
        description: ''
    })) || [];

    if (styleItems.length === 1) {
        stylePick = styleItems[0];
    } else if (styleItems.length > 1) {
        // Move default style to the top if it exists
        const defaultStyleIndex = styleItems.findIndex(item => item.label === config.style);
        if (defaultStyleIndex !== -1) {
            const [defaultStyleItem] = styleItems.splice(defaultStyleIndex, 1);
            styleItems.unshift(defaultStyleItem);
        }

        stylePick = await vscode.window.showQuickPick(styleItems, {
            placeHolder: 'Select Voice Style'
        });
    }

    // Use empty string if no style is selected
    const styleValue = stylePick ? stylePick.label : '';

    // Save the selections to configuration
    const updateConfig = vscode.workspace.getConfiguration('speechify');
    await updateConfig.update('voiceName', shortNamePick.label, vscode.ConfigurationTarget.Global);
    await updateConfig.update('voiceGender', genderPick.label, vscode.ConfigurationTarget.Global);
    await updateConfig.update('voiceStyle', styleValue, vscode.ConfigurationTarget.Global);
    showVoiceConfig(shortNamePick.label);
}

function showVoiceConfig(shortName) {
    const selectedVoice = voiceList.find(voice => voice.ShortName === shortName);

    if (selectedVoice) {
        const message = `
        Voice: ${selectedVoice.DisplayName}, Locale: ${selectedVoice.LocaleName}, ${selectedVoice.Gender}, Sample Rate: ${selectedVoice.SampleRateHertz} Hz, Words Per Minute: ${selectedVoice.WordsPerMinute}, Status: ${selectedVoice.Status}, Short Name: ${selectedVoice.ShortName}`;
        vscode.window.showInformationMessage(message);
    }
}


let config = vscode.workspace.getConfiguration('speechify');
let subscriptionKey = config.get('azureSpeechServicesKey');
let region = config.get('speechServicesRegion');

const endpoint = `https://${region}.tts.speech.microsoft.com`;

// Function to escape special characters in SSML
function escapeSpecialChars(text) {
    return text.replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}


// Function to split text into chunks of specified max length
function splitTextIntoChunks(text, maxLength) {
    const chunks = [];
    let currentChunk = '';

    const sentences = text.split(/\n/); // Split by new line to preserve sentence structure
    for (const sentence of sentences) {
        // Check if adding this sentence would exceed the max length
        if ((currentChunk + sentence).length > maxLength) {
            if (currentChunk) {
                chunks.push(currentChunk.trim());
            }
            currentChunk = sentence + '\n'; // Start a new chunk
        } else {
            currentChunk += sentence + '\n'; // Add sentence to current chunk
        }
    }
    if (currentChunk) {
        chunks.push(currentChunk.trim()); // Add the last chunk
    }

    return chunks;
}

// Function to request speech from AzureTTS with retry logic
async function getSpeechFromAzureTTS(text, language, currentFile) {
    const currentDir = path.dirname(currentFile);
    const currentFileName = path.basename(currentFile, path.extname(currentFile));

    const voiceAttributes = getVoiceAttributes(language);
    showVoiceConfig(voiceAttributes.name);

    const chunks = splitTextIntoChunks(text, 3000); // Split text into chunks of 3000 characters

    const totalParts = chunks.length;

    for (let index = 0; index < totalParts; index++) {
        vscode.window.showInformationMessage(`Generating speech for chunk ${index + 1} of ${totalParts}...`);
        const chunk = chunks[index];
        console.log('Converting chunk number:', index + 1, 'of', totalParts);
        const escapedText = escapeSpecialChars(chunk);
        console.log('escapedText:', escapedText);

        const date = new Date();
        const year = date.getFullYear();
        const month = ("0" + (date.getMonth() + 1)).slice(-2);
        const day = ("0" + date.getDate()).slice(-2);
        const currentDate = `${year}${month}${day}`;

        // Determine the file name based on the number of chunks
        let newFileName;
        if (totalParts === 1) {
            newFileName = `${currentFileName}_${currentDate}.mp3`; // No sequence number
        } else {
            newFileName = `${currentFileName}_${currentDate}_part${index + 1}_of_${totalParts}.mp3`; // With sequence number
        }
        
        const filePath = path.join(currentDir, newFileName);
        
        const ssml = `<speak version='1.0' xml:lang='${language}'>
                          <voice xml:lang='${language}' xml:gender='${voiceAttributes.gender}' name='${voiceAttributes.name}' style='${voiceAttributes.style}'>
                              ${escapedText}
                          </voice>
                      </speak>`;

        const url = `${endpoint}/cognitiveservices/v1`;
        const headers = {
            "Content-Type": "application/ssml+xml",
            "X-Microsoft-OutputFormat": "audio-16khz-128kbitrate-mono-mp3",
            "Ocp-Apim-Subscription-Key": subscriptionKey
        };

        // Retry logic
        let retries = 0;
        const maxRetries = 2;

        while (retries <= maxRetries) {
            try {
                const response = await axios.post(url, ssml, { headers, responseType: "arraybuffer" });
                const audioData = Buffer.from(response.data, 'binary');
                
                fs.writeFile(filePath, audioData, (err) => {
                    if (err) {
                        console.error(err);
                        vscode.window.showErrorMessage(`Error occurred while saving audio! ❌ Error: ${err.message}`);
                    } else {
                        console.log(`Audio saved as ${filePath}`);
                        vscode.window.showInformationMessage(`✨ Speech file ${newFileName} generated successfully! ✨`);
                    }
                });

                // If the request was successful, break out of the retry loop
                break; 
            } catch (error) {
                console.error(`Attempt ${retries + 1} failed:`, error.message);

                // If the error is not a network error, we do not retry
                if (error.code !== 'ECONNRESET' && error.response) {
                    vscode.window.showErrorMessage(`Error occurred while generating speech for chunk ${index + 1}! ❌ Error: ${error.message}`);
                    break; // Break if it's a different error
                }

                // Increment the retry count
                retries++;
                if (retries > maxRetries) {
                    vscode.window.showErrorMessage(`Failed to generate speech for chunk ${index + 1} after ${maxRetries + 1} attempts! ❌`);
                } else {
                    console.log(`Retrying... (${retries}/${maxRetries})`);
                }
            }
        }
    }
}



// Function to configure Azure settings
async function configureSpeechifyAzureSettings() {
    const config = vscode.workspace.getConfiguration('speechify');

    const azureKey = config.get('azureSpeechServicesKey');
    const azureRegion = config.get('speechServicesRegion');

    // Input box for Azure Speech Services Key
    const newAzureKey = await vscode.window.showInputBox({
        value: azureKey,
        placeHolder: 'Enter Azure Speech Services Key',
        prompt: 'Azure Speech Services Key'
    });

    if (newAzureKey === undefined) return; // User cancelled input

    // Input box for Azure Speech Services Region
    const newAzureRegion = await vscode.window.showInputBox({
        value: azureRegion,
        placeHolder: 'Enter Azure Speech Services Region',
        prompt: 'Azure Speech Services Region'
    });

    if (newAzureRegion === undefined) return; // User cancelled input

    // Save the new settings
    await config.update('azureSpeechServicesKey', newAzureKey, vscode.ConfigurationTarget.Global);
    await config.update('speechServicesRegion', newAzureRegion, vscode.ConfigurationTarget.Global);

    vscode.window.showInformationMessage('Azure Speech Services settings have been updated.');
}

function activate(context) {
    let disposable = vscode.commands.registerCommand('extension.speechify', function () {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return; // No open text editor
        }

        const selection = editor.selection;
        const text = editor.document.getText(selection);
        const currentFile = editor.document.fileName;
        const language = getVoiceAttributes().name.split('-').slice(0, 2).join('-'); // assume that the language is the prefix of the voice name
        // 检查当前文件是否为 Markdown 文件
        if (path.extname(currentFile) === '.md') {
            // 使用 `extractTextFromMarkdown` 函数处理 Markdown 文本
            const filteredText = extractTextFromMarkdown(text);
            console.log('filteredText:', filteredText);
            getSpeechFromAzureTTS(filteredText, language, currentFile);
        } else {
            getSpeechFromAzureTTS(text, language, currentFile);
        }

    });

    // Register the configure voice settings command
    let configureVoiceDisposable = vscode.commands.registerCommand('extension.configureSpeechifyVoiceSettings', configureSpeechifyVoiceSettings);
    // Register the configure Azure settings command
    let configureAzureDisposable = vscode.commands.registerCommand('extension.configureSpeechifyAzureSettings', configureSpeechifyAzureSettings);
    // Register the show voice settings command
    let showVoiceSettingsDisposable = vscode.commands.registerCommand('extension.showSpeechifyVoiceSettings', () => {
        const voiceAttributes = getVoiceAttributes();
        showVoiceConfig(voiceAttributes.name);
    });

    context.subscriptions.push(disposable);
    context.subscriptions.push(configureAzureDisposable);
    context.subscriptions.push(configureVoiceDisposable);
    context.subscriptions.push(showVoiceSettingsDisposable);
}



// Deactivation of the extension
function deactivate() { }

module.exports = {
    activate,
    deactivate
}