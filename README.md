# Speechify README

This extension allows you to convert selected text into speech using Azure Text to Speech service. The converted speech is saved as an MP3 file in the same directory as your current file.

## Features

Once the extension is installed and configured with Azure Text to Speech service keys, you can select any text in your editor and convert it into speech with right-click context menu and select "Speechify".  
The speech is saved as an MP3 file in the same directory as your current file.

The converted speech can be played back using any standard media player.

## Requirements

You need to have an Azure account and a subscription key for Azure Text to Speech service. 


## Extension Settings

1. Configure the Azure Text to Speech service settings by selecting "Configure Speechify Azure Settings" from the command palette. You will need to enter your Azure subscription key and region.
2. Configure the voice settings by selecting "Configure Speechify Voice Settings" from the command palette. You can choose the locale, gender, voice name, and style for the speech conversion.

## Known Issues

No known issues so far.

## Release Notes

### 1.0.0

Initial release of speechify. The extension now supports text to speech conversion for selected text and saving the converted speech as an MP3 file.

### 1.0.1

Fix the issue the file name of the converted speech may not correct.

### 1.0.2

Add new configuration options for voice attributes.

### 1.0.3

Add icon for the extension.

### 1.1.0

Add new configuration options to simplify the voice selection process. You can just select Confgure Speechify Voice Settings from the command palette and choose the voice you want to use.
Add a new command to configure Azure settings for the Speechify extension. This command allows users to enter their Azure Speech Services Key and Region, which will be used for text-to-speech conversion. 

### 1.1.1
Fixed the issue that the extension may not work properly when the text content contains special characters.

### 1.2.0
Modify the right click context menu to show Congfigure Voice Settings and Show Voice Settings commands.

### 1.3.0
Split the text content into multiple parts to generate multiple audio files if the text content is too long.
Added retry mechanism to handle the case that the request is failed due to network issue.