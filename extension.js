const vscode = require('vscode');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

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

    vscode.window.showInformationMessage(`Voice configuration updated: ${shortNamePick.label}`);
}



let config = vscode.workspace.getConfiguration('speechify');
let subscriptionKey = config.get('azureSpeechServicesKey');
let region = config.get('speechServicesRegion');

const endpoint = `https://${region}.tts.speech.microsoft.com`;


// Function to request speech from AzureTTS
function getSpeechFromAzureTTS(text, language, currentFile) {
    const currentDir = path.dirname(currentFile);
    const currentFileName = path.basename(currentFile, path.extname(currentFile));

    const date = new Date();
    const year = date.getFullYear();
    const month = ("0" + (date.getMonth() + 1)).slice(-2);
    const day = ("0" + date.getDate()).slice(-2);
    const currentDate = `${year}${month}${day}`;

    const newFileName = `${currentFileName}_${currentDate}.mp3`;
    const filePath = path.join(currentDir, newFileName);
    const voiceAttributes = getVoiceAttributes(language);

    const ssml = `<speak version='1.0' xml:lang='${language}'>
                    <voice xml:lang='${language}' xml:gender='${voiceAttributes.gender}' name='${voiceAttributes.name}' style='${voiceAttributes.style}'>
                        ${text}
                    </voice>
                </speak>`;

    const url = `${endpoint}/cognitiveservices/v1`;

    const headers = {
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-16khz-128kbitrate-mono-mp3",
        "Ocp-Apim-Subscription-Key": subscriptionKey
    };

    axios.post(url, ssml, { headers, responseType: "arraybuffer" }).then(response => {
        const audioData = Buffer.from(response.data, 'binary');
        let statusBarMessage = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        fs.writeFile(filePath, audioData, function (err) {
            if (err) {
                console.error(err);
                vscode.window.showErrorMessage(`Error occurred while saving audio! ❌ Error: ${err.message}`);
            } else {
                console.log(`Audio saved as ${filePath}`);
                statusBarMessage.text = `✨ Speech audio saved successfully ✔️`;
                statusBarMessage.show();

                // Hide the status bar message after 10 seconds
                setTimeout(() => {
                    statusBarMessage.hide();
                }, 10000);  // 10000 milliseconds = 10 seconds
            }
        });
    }).catch(error => {
        console.error(error);
    });
}

// Activation of the extension
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

        getSpeechFromAzureTTS(text, language, currentFile);
    });

    // Register the configure voice settings command
    let configureVoiceDisposable = vscode.commands.registerCommand('extension.configureSpeechifyVoiceSettings', configureSpeechifyVoiceSettings);

    context.subscriptions.push(disposable);
    context.subscriptions.push(configureVoiceDisposable);
}

// Deactivation of the extension
function deactivate() { }

module.exports = {
    activate,
    deactivate
}