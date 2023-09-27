这个插件在点击右键时，能够调用我的插件，然后插件能够读取当前选中的内容，调用azure的语音服务，将内容转换成语音文件。
我想实现在配置中添加对以下选项的配置
            voice name，例如"zh-CN-YunyangNeural",
            gender，例如 "Male",
            style， 例如 "friendly"

默认配置值为zh-CN-YunyangNeural, Male, friendly

去掉自动检测语言，而是直接使用配置的语言


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

        detectFirstLanguage(text).then(language => {
            getSpeechFromAzureTTS(text, language, currentFile);
        });
    });

    context.subscriptions.push(disposable);
}

// Deactivation of the extension
function deactivate() {}

module.exports = {
    activate,
    deactivate
}


//languageDetection.js

/* eslint-disable no-control-regex */
function detectLanguage(text) {
    const englishRegex = /\b[a-zA-Z]+\b/g;
    const chineseRegex = /[\u4E00-\u9FFF]/g;

    const englishCount = (text.match(englishRegex) || []).length;
    const chineseCount = (text.match(chineseRegex) || []).length;

    if (englishCount > chineseCount) {
        return "en-US";
    } else if (chineseCount > englishCount) {
        return "zh-CN";
    } else {
        return "unknown";
    }
}

exports.detectFirstLanguage = async function (message) {
    const sentences = message.split(/([.。!?！？])/).filter(sentence => sentence.trim());
    const firstLanguage = detectLanguage(sentences[0]);
    return firstLanguage;
};

//package.json
{
  "name": "speechify",
  "displayName": "Speechify",
  "description": "",
  "version": "1.0.1",
  "engines": {
    "vscode": "^1.82.0"
  },
  "categories": [
    "Other"
  ],
  "activationEvents": [],
  "main": "./extension.js",
  "contributes": {
    "commands": [
      {
        "command": "extension.speechify",
        "title": "Speechify"
      }
    ],
    "menus": {
      "editor/context": [
        {
          "command": "extension.speechify",
          "group": "navigation"
        }
      ]
    },
    "configuration": {
      "title": "Speechify",
      "properties": {
        "speechify.azureSpeechServicesKey": {
          "type": "string",
          "default": "",
          "description": "Azure SpeechServices Key"
        },
        "speechify.speechServicesRegion": {
          "type": "string",
          "default": "eastus",
          "description": "SpeechServices Region"
        }
      }
    }
  },
  "scripts": {
    "lint": "eslint .",
    "pretest": "npm run lint",
    "test": "node ./test/runTest.js"
  },
  "devDependencies": {
    "@types/mocha": "^10.0.1",
    "@types/node": "16.x",
    "@types/vscode": "^1.82.0",
    "@vscode/test-electron": "^2.3.4",
    "eslint": "^8.47.0",
    "glob": "^10.3.3",
    "mocha": "^10.2.0",
    "typescript": "^5.1.6"
  },
  "dependencies": {
    "axios": "^1.5.0"
  }
}

