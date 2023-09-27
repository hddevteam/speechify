const vscode = require('vscode');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

let config = vscode.workspace.getConfiguration('speechify');
let subscriptionKey = config.get('azureSpeechServicesKey');
let region = config.get('speechServicesRegion');

const endpoint = `https://${region}.tts.speech.microsoft.com`;


function getVoiceAttributes() {
    let config = vscode.workspace.getConfiguration('speechify');
    return {
        name: config.get('voiceName'),
        gender: config.get('voiceGender'),
        style: config.get('voiceStyle')
    };
}


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
        const language = getVoiceAttributes().name.split('-').slice(0,2).join('-'); // assume that the language is the prefix of the voice name

        getSpeechFromAzureTTS(text, language, currentFile);
    });

    context.subscriptions.push(disposable);
}


// Deactivation of the extension
function deactivate() { }

module.exports = {
    activate,
    deactivate
}
