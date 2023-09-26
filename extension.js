const vscode = require('vscode');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { detectFirstLanguage } = require("./languageDetection");

let config = vscode.workspace.getConfiguration('speechify');
let subscriptionKey = config.get('azureSpeechServicesKey');
let region = config.get('speechServicesRegion');

const endpoint = `https://${region}.tts.speech.microsoft.com`;


// Function to get voice attributes based on language
function getVoiceAttributes(language) {
    if (language === "en-US") {
        return {
            name: "en-US-JennyNeural",
            gender: "Female",
            style: "friendly"
        };
    } else if (language === "zh-CN") {
        return {
            name: "zh-CN-YunyangNeural",
            gender: "Male",
            style: "friendly"
        };
    } else {
        return {
            name: "en-US-JennyNeural",
            gender: "Female",
            style: "friendly"
        };
    }
}

// Function to request speech from AzureTTS
function getSpeechFromAzureTTS(text, language, currentFile) {

    const currentDir = path.dirname(currentFile);
    const currentFileName = path.basename(currentFile, path.extname(currentFile));

    const date = new Date();
    const year = date.getFullYear();
    const month = ("0" + (date.getMonth() + 1)).slice(-2);
    const day = ("0" + date.getDate()).slice(-2);
    const hours = ("0" + date.getHours()).slice(-2);
    const minutes = ("0" + date.getMinutes()).slice(-2);
    const seconds = ("0" + date.getSeconds()).slice(-2);
    const currentDate = `${year}${month}${day}_${hours}${minutes}${seconds}`;

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
        fs.writeFile(filePath, audioData, function (err) {
            if (err) {
                console.error(err);
            } else {
                console.log(`Audio saved as ${filePath}`);
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

        detectFirstLanguage(text).then(language => {
            getSpeechFromAzureTTS(text, language, currentFile);
        });
    });

    context.subscriptions.push(disposable);
}

// Deactivation of the extension
function deactivate() { }

module.exports = {
    activate,
    deactivate
}
