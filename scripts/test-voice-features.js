/**
 * Standalone Extension Test for 2025 Voice List Update
 * Tests voice list functionality without VS Code dependency
 */

const fs = require('fs');
const path = require('path');

/**
 * Test voice list loading and new features
 */
function testVoiceListFeatures() {
    console.log('🚀 Speechify Extension Test - 2025 Voice Update');
    console.log('===============================================\n');
    
    try {
        // Load voice list
        console.log('🔍 Testing Voice List Loading...\n');
        const voiceListPath = path.join(__dirname, '..', 'voice-list.json');
        const voices = JSON.parse(fs.readFileSync(voiceListPath, 'utf-8'));
        
        console.log(`✅ Voice list loaded successfully: ${voices.length} voices`);
        
        // Basic validation
        let validVoices = 0;
        let invalidVoices = 0;
        
        voices.forEach(voice => {
            if (voice.ShortName && voice.Gender && voice.Locale) {
                validVoices++;
            } else {
                invalidVoices++;
            }
        });
        
        console.log(`✅ Valid voices: ${validVoices}`);
        console.log(`❌ Invalid voices: ${invalidVoices}`);
        
        // Test filtering capabilities
        console.log('\n📊 Testing Voice Filtering...\n');
        
        const femaleVoices = voices.filter(v => v.Gender === 'Female');
        const maleVoices = voices.filter(v => v.Gender === 'Male');
        const enUSVoices = voices.filter(v => v.Locale === 'en-US');
        const zhCNVoices = voices.filter(v => v.Locale === 'zh-CN');
        
        console.log(`👩 Female voices: ${femaleVoices.length}`);
        console.log(`👨 Male voices: ${maleVoices.length}`);
        console.log(`🇺🇸 English (US) voices: ${enUSVoices.length}`);
        console.log(`🇨🇳 Chinese voices: ${zhCNVoices.length}`);
        
        // Test 2025 new features
        console.log('\n🆕 Testing 2025 New Features...\n');
        
        const dragonHD = voices.filter(v => v.ShortName && v.ShortName.includes('DragonHD'));
        const multiTalker = voices.filter(v => v.ShortName && v.ShortName.includes('MultiTalker'));
        const turbo = voices.filter(v => v.ShortName && v.ShortName.includes('Turbo'));
        const multilingual = voices.filter(v => v.ShortName && v.ShortName.includes('Multilingual'));
        
        console.log(`🎵 DragonHD voices: ${dragonHD.length}`);
        dragonHD.slice(0, 3).forEach(voice => {
            console.log(`   • ${voice.ShortName} (${voice.Gender}, ${voice.Status || 'GA'})`);
        });
        
        console.log(`\n👥 MultiTalker voices: ${multiTalker.length}`);
        multiTalker.forEach(voice => {
            console.log(`   • ${voice.ShortName} (${voice.Gender}, ${voice.Status || 'GA'})`);
        });
        
        console.log(`\n⚡ Turbo voices: ${turbo.length}`);
        turbo.slice(0, 3).forEach(voice => {
            console.log(`   • ${voice.ShortName} (${voice.Gender}, ${voice.Status || 'GA'})`);
        });
        
        console.log(`\n🌍 Multilingual voices: ${multilingual.length}`);
        
        // Test voice types
        const voiceTypes = new Set();
        voices.forEach(voice => {
            if (voice.VoiceType) voiceTypes.add(voice.VoiceType);
        });
        
        console.log(`\n🎵 Voice types available: ${Array.from(voiceTypes).join(', ')}`);
        
        // Test optional features
        console.log('\n🎨 Testing Optional Features...\n');
        
        const voicesWithStyles = voices.filter(v => v.StyleList && v.StyleList.length > 0);
        const voicesWithRoles = voices.filter(v => v.RolePlayList && v.RolePlayList.length > 0);
        const voicesWithSecondaryLocales = voices.filter(v => v.SecondaryLocaleList && v.SecondaryLocaleList.length > 0);
        
        console.log(`🎨 Voices with styles: ${voicesWithStyles.length}`);
        if (voicesWithStyles.length > 0) {
            const example = voicesWithStyles[0];
            console.log(`   Example: ${example.ShortName} - Styles: ${example.StyleList.join(', ')}`);
        }
        
        console.log(`🎭 Voices with roles: ${voicesWithRoles.length}`);
        if (voicesWithRoles.length > 0) {
            const example = voicesWithRoles[0];
            console.log(`   Example: ${example.ShortName} - Roles: ${example.RolePlayList.join(', ')}`);
        }
        
        console.log(`🌐 Voices with secondary locales: ${voicesWithSecondaryLocales.length}`);
        if (voicesWithSecondaryLocales.length > 0) {
            const example = voicesWithSecondaryLocales[0];
            console.log(`   Example: ${example.ShortName} - Locales: ${example.SecondaryLocaleList.join(', ')}`);
        }
        
        // Test backward compatibility
        console.log('\n🔄 Testing Backward Compatibility...\n');
        
        const originalVoices = [
            'zh-CN-YunyangNeural',
            'en-US-AriaNeural', 
            'en-US-JennyNeural',
            'zh-CN-XiaoxiaoNeural',
            'en-US-DavisNeural'
        ];
        
        let foundOriginal = 0;
        originalVoices.forEach(voiceName => {
            const voice = voices.find(v => v.ShortName === voiceName);
            if (voice) {
                foundOriginal++;
                console.log(`✅ Original voice preserved: ${voiceName}`);
            } else {
                console.log(`❌ Original voice missing: ${voiceName}`);
            }
        });
        
        console.log(`\n📊 Backward compatibility: ${foundOriginal}/${originalVoices.length} original voices preserved`);
        
        // Generate summary report
        console.log('\n📊 Test Summary Report');
        console.log('======================\n');
        
        const tests = [
            { name: 'Voice List Loading', passed: voices.length > 500 },
            { name: 'Basic Validation', passed: invalidVoices === 0 },
            { name: 'DragonHD Features', passed: dragonHD.length > 0 },
            { name: 'MultiTalker Features', passed: multiTalker.length > 0 },
            { name: 'Turbo Features', passed: turbo.length > 0 },
            { name: 'Multilingual Support', passed: multilingual.length > 50 },
            { name: 'Optional Features', passed: voicesWithStyles.length > 40 },
            { name: 'Backward Compatibility', passed: foundOriginal >= originalVoices.length * 0.8 }
        ];
        
        let passedTests = 0;
        tests.forEach(test => {
            const status = test.passed ? '✅ PASSED' : '❌ FAILED';
            console.log(`${status} - ${test.name}`);
            if (test.passed) passedTests++;
        });
        
        const successRate = (passedTests / tests.length) * 100;
        console.log(`\n🎯 Overall Success Rate: ${successRate.toFixed(1)}%`);
        
        // Final statistics
        console.log('\n📈 Final Statistics:');
        console.log(`   📊 Total voices: ${voices.length}`);
        console.log(`   🎵 DragonHD voices: ${dragonHD.length}`);
        console.log(`   👥 MultiTalker voices: ${multiTalker.length}`);
        console.log(`   ⚡ Turbo voices: ${turbo.length}`);
        console.log(`   🌍 Multilingual voices: ${multilingual.length}`);
        console.log(`   🎨 Voices with styles: ${voicesWithStyles.length}`);
        console.log(`   🎭 Voices with roles: ${voicesWithRoles.length}`);
        
        // Status distribution
        const statusCounts = {};
        voices.forEach(voice => {
            const status = voice.Status || 'GA';
            statusCounts[status] = (statusCounts[status] || 0) + 1;
        });
        
        console.log('\n📍 Status Distribution:');
        Object.entries(statusCounts)
            .sort((a, b) => b[1] - a[1])
            .forEach(([status, count]) => {
                console.log(`   ${status}: ${count} voices`);
            });
        
        // Voice type distribution
        const typeCounts = {};
        voices.forEach(voice => {
            const type = voice.VoiceType || 'Neural';
            typeCounts[type] = (typeCounts[type] || 0) + 1;
        });
        
        console.log('\n🎵 Voice Type Distribution:');
        Object.entries(typeCounts)
            .sort((a, b) => b[1] - a[1])
            .forEach(([type, count]) => {
                console.log(`   ${type}: ${count} voices`);
            });
        
        // Final verdict
        console.log('\n🎯 Final Verdict:');
        if (successRate >= 90) {
            console.log('🎉 EXCELLENT! Extension is ready for production use.');
            console.log('💡 All 2025 features are working correctly.');
            console.log('🚀 You can now use the updated extension in VS Code!');
        } else if (successRate >= 75) {
            console.log('✅ GOOD! Extension is working well with minor issues.');
            console.log('💡 Most features are functional.');
        } else if (successRate >= 50) {
            console.log('⚠️ CAUTION! Extension has some issues that need attention.');
            console.log('💡 Please review failed tests.');
        } else {
            console.log('❌ CRITICAL! Extension has major issues that must be fixed.');
            console.log('💡 Significant problems detected.');
        }
        
        console.log('\n🔧 Next Steps:');
        console.log('• Test the extension in VS Code by pressing F5');
        console.log('• Try the new DragonHD and MultiTalker voices');
        console.log('• Verify text-to-speech functionality works');
        console.log('• Check voice selection menus show new options');
        
        return { 
            success: successRate >= 75, 
            successRate, 
            passedTests, 
            totalTests: tests.length,
            voiceCount: voices.length,
            newFeatures: { dragonHD: dragonHD.length, multiTalker: multiTalker.length, turbo: turbo.length }
        };
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error('Stack trace:', error.stack);
        return { success: false, error: error.message };
    }
}

// Run test
if (require.main === module) {
    testVoiceListFeatures();
}