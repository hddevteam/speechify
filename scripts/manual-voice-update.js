/**
 * Manual Voice List Update Script
 * Based on Microsoft Azure Speech Services official documentation (2025)
 * 
 * This script creates an updated voice list by adding the latest 2025 voices
 * to the existing voice-list.json based on official Microsoft documentation.
 */

const fs = require('fs');
const path = require('path');

const CURRENT_VOICE_LIST_PATH = path.join(__dirname, '..', 'voice-list.json');
const UPDATED_VOICE_LIST_PATH = path.join(__dirname, '..', 'voice-list-updated-2025.json');

// New voices from Microsoft official documentation (2025)
const NEW_VOICES_2025 = [
    // DragonHD Latest Neural Voices
    {
        "Name": "Microsoft Server Speech Text to Speech Voice (en-US, Ava3DragonHDLatestNeural)",
        "DisplayName": "Ava3",
        "LocalName": "Ava3",
        "ShortName": "en-US-Ava3:DragonHDLatestNeural",
        "Gender": "Female",
        "Locale": "en-US",
        "LocaleName": "English (United States)",
        "VoiceType": "DragonHD",
        "Status": "Preview",
        "SampleRateHertz": "48000",
        "WordsPerMinute": "150",
        "Description": "Optimized for Podcast content"
    },
    {
        "Name": "Microsoft Server Speech Text to Speech Voice (en-US, Andrew3DragonHDLatestNeural)",
        "DisplayName": "Andrew3",
        "LocalName": "Andrew3",
        "ShortName": "en-US-Andrew3:DragonHDLatestNeural",
        "Gender": "Male",
        "Locale": "en-US",
        "LocaleName": "English (United States)",
        "VoiceType": "DragonHD",
        "Status": "Preview",
        "SampleRateHertz": "48000",
        "WordsPerMinute": "150",
        "Description": "Optimized for Podcast content"
    },
    
    // MultiTalker Voices
    {
        "Name": "Microsoft Server Speech Text to Speech Voice (en-US, MultiTalker-Ava-AndrewDragonHDLatestNeural)",
        "DisplayName": "MultiTalker Ava-Andrew",
        "LocalName": "MultiTalker Ava-Andrew",
        "ShortName": "en-US-MultiTalker-Ava-Andrew:DragonHDLatestNeural",
        "Gender": "Neutral",
        "Locale": "en-US",
        "LocaleName": "English (United States)",
        "VoiceType": "MultiTalker",
        "Status": "Preview",
        "SampleRateHertz": "48000",
        "WordsPerMinute": "150",
        "Description": "Multi-speaker conversation voice"
    },
    {
        "Name": "Microsoft Server Speech Text to Speech Voice (en-US, MultiTalker-Ava-SteffanDragonHDLatestNeural)",
        "DisplayName": "MultiTalker Ava-Steffan",
        "LocalName": "MultiTalker Ava-Steffan",
        "ShortName": "en-US-MultiTalker-Ava-Steffan:DragonHDLatestNeural",
        "Gender": "Neutral",
        "Locale": "en-US",
        "LocaleName": "English (United States)",
        "VoiceType": "MultiTalker",
        "Status": "Preview",
        "SampleRateHertz": "48000",
        "WordsPerMinute": "150",
        "Description": "Multi-speaker conversation voice"
    },
    
    // Turbo Multilingual Voices
    {
        "Name": "Microsoft Server Speech Text to Speech Voice (en-US, NovaTurboMultilingualNeural)",
        "DisplayName": "Nova Turbo",
        "LocalName": "Nova Turbo",
        "ShortName": "en-US-NovaTurbo:MultilingualNeural",
        "Gender": "Female",
        "Locale": "en-US",
        "LocaleName": "English (United States)",
        "SecondaryLocaleList": ["zh-CN", "es-ES", "fr-FR", "de-DE", "ja-JP"],
        "VoiceType": "Turbo",
        "Status": "Preview",
        "SampleRateHertz": "48000",
        "WordsPerMinute": "180",
        "Description": "Fast multilingual synthesis"
    },
    {
        "Name": "Microsoft Server Speech Text to Speech Voice (en-US, OnyxTurboMultilingualNeural)",
        "DisplayName": "Onyx Turbo",
        "LocalName": "Onyx Turbo",
        "ShortName": "en-US-OnyxTurbo:MultilingualNeural",
        "Gender": "Male",
        "Locale": "en-US",
        "LocaleName": "English (United States)",
        "SecondaryLocaleList": ["zh-CN", "es-ES", "fr-FR", "de-DE", "ja-JP"],
        "VoiceType": "Turbo",
        "Status": "Preview",
        "SampleRateHertz": "48000",
        "WordsPerMinute": "180",
        "Description": "Fast multilingual synthesis"
    },
    {
        "Name": "Microsoft Server Speech Text to Speech Voice (en-US, ShimmerTurboMultilingualNeural)",
        "DisplayName": "Shimmer Turbo",
        "LocalName": "Shimmer Turbo",
        "ShortName": "en-US-ShimmerTurbo:MultilingualNeural",
        "Gender": "Female",
        "Locale": "en-US",
        "LocaleName": "English (United States)",
        "SecondaryLocaleList": ["zh-CN", "es-ES", "fr-FR", "de-DE", "ja-JP"],
        "VoiceType": "Turbo",
        "Status": "Preview",
        "SampleRateHertz": "48000",
        "WordsPerMinute": "180",
        "Description": "Fast multilingual synthesis"
    },
    
    // New Multilingual Voices
    {
        "Name": "Microsoft Server Speech Text to Speech Voice (en-US, NancyMultilingualNeural)",
        "DisplayName": "Nancy",
        "LocalName": "Nancy",
        "ShortName": "en-US-Nancy:MultilingualNeural",
        "Gender": "Female",
        "Locale": "en-US",
        "LocaleName": "English (United States)",
        "SecondaryLocaleList": ["zh-CN", "es-ES", "fr-FR", "de-DE"],
        "VoiceType": "Neural",
        "Status": "Preview",
        "SampleRateHertz": "48000",
        "WordsPerMinute": "150"
    },
    {
        "Name": "Microsoft Server Speech Text to Speech Voice (en-US, PhoebeMultilingualNeural)",
        "DisplayName": "Phoebe",
        "LocalName": "Phoebe",
        "ShortName": "en-US-Phoebe:MultilingualNeural",
        "Gender": "Female",
        "Locale": "en-US",
        "LocaleName": "English (United States)",
        "SecondaryLocaleList": ["zh-CN", "es-ES", "fr-FR", "de-DE"],
        "VoiceType": "Neural",
        "Status": "Preview",
        "SampleRateHertz": "48000",
        "WordsPerMinute": "150"
    },
    {
        "Name": "Microsoft Server Speech Text to Speech Voice (en-US, SamuelMultilingualNeural)",
        "DisplayName": "Samuel",
        "LocalName": "Samuel",
        "ShortName": "en-US-Samuel:MultilingualNeural",
        "Gender": "Male",
        "Locale": "en-US",
        "LocaleName": "English (United States)",
        "SecondaryLocaleList": ["zh-CN", "es-ES", "fr-FR", "de-DE"],
        "VoiceType": "Neural",
        "Status": "Preview",
        "SampleRateHertz": "48000",
        "WordsPerMinute": "150"
    },
    
    // Chinese DragonHD Flash Voices
    {
        "Name": "Microsoft Server Speech Text to Speech Voice (zh-CN, XiaochenDragonHDFlashLatestNeural)",
        "DisplayName": "Xiaochen",
        "LocalName": "晓辰",
        "ShortName": "zh-CN-Xiaochen:DragonHDFlashLatestNeural",
        "Gender": "Female",
        "Locale": "zh-CN",
        "LocaleName": "Chinese (China)",
        "VoiceType": "DragonHDFlash",
        "Status": "Preview",
        "SampleRateHertz": "48000",
        "WordsPerMinute": "160"
    },
    {
        "Name": "Microsoft Server Speech Text to Speech Voice (zh-CN, Xiaoxiao2DragonHDFlashLatestNeural)",
        "DisplayName": "Xiaoxiao2",
        "LocalName": "晓晓2",
        "ShortName": "zh-CN-Xiaoxiao2:DragonHDFlashLatestNeural",
        "Gender": "Female",
        "Locale": "zh-CN",
        "LocaleName": "Chinese (China)",
        "VoiceType": "DragonHDFlash",
        "Status": "Preview",
        "SampleRateHertz": "48000",
        "WordsPerMinute": "160",
        "Description": "Optimized for free-talking"
    },
    {
        "Name": "Microsoft Server Speech Text to Speech Voice (zh-CN, YunxiaoDragonHDFlashLatestNeural)",
        "DisplayName": "Yunxiao",
        "LocalName": "云霄",
        "ShortName": "zh-CN-Yunxiao:DragonHDFlashLatestNeural",
        "Gender": "Male",
        "Locale": "zh-CN",
        "LocaleName": "Chinese (China)",
        "VoiceType": "DragonHDFlash",
        "Status": "Preview",
        "SampleRateHertz": "48000",
        "WordsPerMinute": "160"
    },
    {
        "Name": "Microsoft Server Speech Text to Speech Voice (zh-CN, YunyiDragonHDFlashLatestNeural)",
        "DisplayName": "Yunyi",
        "LocalName": "云翼",
        "ShortName": "zh-CN-Yunyi:DragonHDFlashLatestNeural",
        "Gender": "Male",
        "Locale": "zh-CN",
        "LocaleName": "Chinese (China)",
        "VoiceType": "DragonHDFlash",
        "Status": "Preview",
        "SampleRateHertz": "48000",
        "WordsPerMinute": "160"
    }
];

/**
 * Load current voice list
 */
function loadCurrentVoiceList() {
    try {
        const data = fs.readFileSync(CURRENT_VOICE_LIST_PATH, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Failed to load current voice list:', error.message);
        return [];
    }
}

/**
 * Create updated voice list by merging current and new voices
 */
function createUpdatedVoiceList() {
    console.log('📖 Loading current voice list...');
    const currentVoices = loadCurrentVoiceList();
    console.log(`✅ Loaded ${currentVoices.length} current voices`);
    
    console.log('🆕 Adding 2025 new voices...');
    const updatedVoices = [...currentVoices, ...NEW_VOICES_2025];
    console.log(`✅ Added ${NEW_VOICES_2025.length} new voices`);
    
    console.log(`📊 Total voices in updated list: ${updatedVoices.length}`);
    
    return updatedVoices;
}

/**
 * Save updated voice list
 */
function saveUpdatedVoiceList(voices) {
    try {
        fs.writeFileSync(UPDATED_VOICE_LIST_PATH, JSON.stringify(voices, null, 2));
        console.log(`✅ Updated voice list saved to: ${UPDATED_VOICE_LIST_PATH}`);
    } catch (error) {
        console.error('Failed to save updated voice list:', error.message);
    }
}

/**
 * Generate summary report
 */
function generateSummaryReport(voices) {
    const summary = {
        totalVoices: voices.length,
        voiceTypes: {},
        locales: new Set(),
        statuses: {},
        newFeatures: {
            dragonHD: 0,
            multiTalker: 0,
            turbo: 0,
            multilingual: 0
        }
    };
    
    voices.forEach(voice => {
        // Count voice types
        const type = voice.VoiceType || 'Neural';
        summary.voiceTypes[type] = (summary.voiceTypes[type] || 0) + 1;
        
        // Count locales
        summary.locales.add(voice.Locale);
        
        // Count statuses
        const status = voice.Status || 'GA';
        summary.statuses[status] = (summary.statuses[status] || 0) + 1;
        
        // Count new features
        if (voice.ShortName) {
            if (voice.ShortName.includes('DragonHD')) summary.newFeatures.dragonHD++;
            if (voice.ShortName.includes('MultiTalker')) summary.newFeatures.multiTalker++;
            if (voice.ShortName.includes('Turbo')) summary.newFeatures.turbo++;
            if (voice.ShortName.includes('Multilingual')) summary.newFeatures.multilingual++;
        }
    });
    
    return {
        ...summary,
        locales: summary.locales.size
    };
}

/**
 * Print summary
 */
function printSummary(summary) {
    console.log('\n📊 Updated Voice List Summary (2025)');
    console.log('=====================================');
    console.log(`📈 Total voices: ${summary.totalVoices}`);
    console.log(`🌍 Locales supported: ${summary.locales}`);
    
    console.log('\n🎵 Voice Types:');
    Object.entries(summary.voiceTypes).forEach(([type, count]) => {
        console.log(`   ${type}: ${count} voices`);
    });
    
    console.log('\n📍 Status Distribution:');
    Object.entries(summary.statuses).forEach(([status, count]) => {
        console.log(`   ${status}: ${count} voices`);
    });
    
    console.log('\n🆕 2025 New Features:');
    console.log(`🎵 DragonHD voices: ${summary.newFeatures.dragonHD}`);
    console.log(`👥 MultiTalker voices: ${summary.newFeatures.multiTalker}`);
    console.log(`⚡ Turbo voices: ${summary.newFeatures.turbo}`);
    console.log(`🌍 Multilingual voices: ${summary.newFeatures.multilingual}`);
}

/**
 * Main function
 */
function main() {
    console.log('🚀 Creating Updated Voice List for 2025...\n');
    
    const updatedVoices = createUpdatedVoiceList();
    saveUpdatedVoiceList(updatedVoices);
    
    const summary = generateSummaryReport(updatedVoices);
    printSummary(summary);
    
    console.log('\n💡 Next Steps:');
    console.log('1. Review the updated voice list file');
    console.log('2. Backup current voice-list.json');
    console.log('3. Replace voice-list.json with updated version');
    console.log('4. Test the extension with new voices');
    
    console.log('\n📁 Files:');
    console.log(`   📋 Updated: ${UPDATED_VOICE_LIST_PATH}`);
    console.log(`   🔒 Backup: voice-list-backup.json (already created)`);
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = {
    createUpdatedVoiceList,
    NEW_VOICES_2025
};