#!/usr/bin/env node
/**
 * Generate multilingual demo audio files for Speechify website
 * Creates audio samples of our slogan in 5 different languages
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Load configuration
const configPath = path.join(__dirname, '..', 'test-config.json');
let config;
try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (error) {
    console.error('❌ Error loading test-config.json:', error.message);
    console.log('💡 Please ensure test-config.json exists with Azure credentials');
    process.exit(1);
}

const { subscriptionKey } = config;
const region = 'eastus';

// Demo audio configurations
const DEMO_CONFIGS = [
    {
        language: 'en',
        voice: 'en-US-AvaNeural',
        text: 'Speechify transforms your text into high-quality speech with Azure Speech Services',
        filename: 'demo-en.mp3',
        label: 'English'
    },
    {
        language: 'zh',
        voice: 'zh-CN-XiaoxiaoNeural',
        text: 'Speechify 使用Azure语音服务将您的文本转换为高质量语音',
        filename: 'demo-zh.mp3',
        label: '中文'
    },
    {
        language: 'ja',
        voice: 'ja-JP-NanamiNeural',
        text: 'Speechify はテキストを高品質な音声に変換します',
        filename: 'demo-ja.mp3',
        label: '日本語'
    },
    {
        language: 'es',
        voice: 'es-ES-ElviraNeural',
        text: 'Speechify transforma tu texto en voz de alta calidad',
        filename: 'demo-es.mp3',
        label: 'Español'
    },
    {
        language: 'fr',
        voice: 'fr-FR-DeniseNeural',
        text: 'Speechify transforme votre texte en parole de haute qualité',
        filename: 'demo-fr.mp3',
        label: 'Français'
    }
];

const OUTPUT_DIR = path.join(__dirname, '..', 'docs', 'assets', 'audio');

/**
 * Generate SSML for Azure Speech Services
 */
function generateSSML(voice, text) {
    return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${voice.split('-').slice(0, 2).join('-')}">
        <voice name="${voice}">
            <prosody rate="0.9" pitch="+5%">
                ${text}
            </prosody>
        </voice>
    </speak>`;
}

/**
 * Generate audio using Azure Speech Services
 */
async function generateAudio(config) {
    const { voice, text, filename, label } = config;
    
    console.log(`🎤 Generating ${label} audio: ${filename}`);
    
    try {
        const ssml = generateSSML(voice, text);
        
        const response = await axios({
            method: 'post',
            url: `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
            headers: {
                'Ocp-Apim-Subscription-Key': subscriptionKey,
                'Content-Type': 'application/ssml+xml',
                'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
                'User-Agent': 'SpeechifyDemo'
            },
            data: ssml,
            responseType: 'arraybuffer'
        });
        
        // Ensure output directory exists
        if (!fs.existsSync(OUTPUT_DIR)) {
            fs.mkdirSync(OUTPUT_DIR, { recursive: true });
        }
        
        // Write audio file
        const outputPath = path.join(OUTPUT_DIR, filename);
        fs.writeFileSync(outputPath, response.data);
        
        console.log(`   ✅ Generated: ${outputPath} (${(response.data.length / 1024).toFixed(1)} KB)`);
        return true;
        
    } catch (error) {
        console.error(`   ❌ Failed to generate ${label} audio:`, error.response?.status || error.message);
        if (error.response?.data) {
            console.error(`   📋 Error details:`, error.response.data.toString());
        }
        return false;
    }
}

/**
 * Main function
 */
async function main() {
    console.log('🚀 Generating multilingual demo audio files for Speechify website...\n');
    
    // Validate Azure credentials
    if (!subscriptionKey || subscriptionKey.length < 10) {
        console.error('❌ Invalid Azure subscription key in test-config.json');
        process.exit(1);
    }
    
    let successCount = 0;
    
    for (const config of DEMO_CONFIGS) {
        const success = await generateAudio(config);
        if (success) successCount++;
        
        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log(`\n📊 Demo Audio Generation Summary:`);
    console.log(`   ✅ Successful: ${successCount}/${DEMO_CONFIGS.length}`);
    console.log(`   📁 Output Directory: ${OUTPUT_DIR}`);
    
    if (successCount === DEMO_CONFIGS.length) {
        console.log('\n🎉 All demo audio files generated successfully!');
        console.log('   Ready for website integration');
    } else {
        console.log('\n⚠️  Some audio files failed to generate');
        console.log('   Check your Azure credentials and network connection');
    }
}

// Run the script
main().catch(error => {
    console.error('💥 Script failed:', error);
    process.exit(1);
});
