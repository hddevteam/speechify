# Speechify README

This extension allows you to convert selected text into speech using Azure Text to Speech service. The converted speech is saved as an MP3 file in the same directory as your current file.

## Features

Once the extension is installed and configured with Azure Text to Speech service keys, you can select any text in your editor and convert it into speech. The speech is saved as an MP3 file in the same directory as your current file.

The converted speech can be played back using any standard media player.

## Requirements

You need to have an Azure account and a subscription key for Azure Text to Speech service. 


## Extension Settings

This extension contributes the following settings:

* `speechify.azureSpeechServicesKey`: Your Azure Text to Speech service key.
* `speechify.speechServicesRegion`: The region of your Azure Text to Speech service.
* `speechify.voiceName`: The name of the voice to use for the Azure Text to Speech service. Default value is "zh-CN-YunyangNeural".
* `speechify.voiceGender`: The gender of the voice to use for the Azure Text to Speech service. Default value is "Male".
* `speechify.voiceStyle`: The style of the voice to use for the Azure Text to Speech service. Default value is "friendly".

Please refer to the [official Azure documentation](https://docs.microsoft.com/azure/cognitive-services/speech-service/language-support#text-to-speech) for a full list of supported voices. The voice name should be in the format of "[language]-[region]-[name][Neural]". The gender should be either "Male" or "Female". The style should be one of the styles supported by the chosen voice.

## Known Issues

No known issues so far.

## Release Notes

### 1.0.0

Initial release of speechify. The extension now supports text to speech conversion for selected text and saving the converted speech as an MP3 file.

### 1.0.1

Fix the issue the file name of the converted speech may not correct.

### 1.0.2

Add new configuration options for voice attributes, no need to support auto language detection.