const fs = require('fs');

console.log('🔍 语音列表比较分析');
console.log('='.repeat(50));

try {
  const current = JSON.parse(fs.readFileSync('voice-list.json', 'utf-8'));
  const backup = JSON.parse(fs.readFileSync('voice-list-backup.json', 'utf-8'));

  console.log('📊 数量对比:');
  console.log('  当前版本: ' + current.length + ' 个语音');
  console.log('  备份版本: ' + backup.length + ' 个语音');
  console.log('  新增语音: ' + (current.length - backup.length) + ' 个');
  console.log('');

  // 找出新增的语音
  const backupNames = new Set(backup.map(v => v.ShortName));
  const newVoices = current.filter(v => !backupNames.has(v.ShortName));

  if (newVoices.length > 0) {
    console.log('🆕 新增的语音列表:');
    console.log('='.repeat(30));
    newVoices.forEach((voice, index) => {
      console.log(`${index + 1}. ${voice.ShortName}`);
      console.log(`   显示名: ${voice.DisplayName}`);
      console.log(`   性别: ${voice.Gender}`);
      console.log(`   语言: ${voice.Locale}`);
      console.log(`   类型: ${voice.VoiceType || 'Neural'}`);
      console.log(`   状态: ${voice.Status || 'GA'}`);
      if (voice.Description) {
        console.log(`   描述: ${voice.Description}`);
      }
      console.log('');
    });
    
    // 按类型分析新语音
    const voiceTypes = {};
    newVoices.forEach(voice => {
      const type = voice.VoiceType || 'Neural';
      voiceTypes[type] = (voiceTypes[type] || 0) + 1;
    });
    
    console.log('📈 新增语音类型统计:');
    Object.entries(voiceTypes).forEach(([type, count]) => {
      console.log(`  ${type}: ${count} 个`);
    });

    // 按语言分析
    const locales = {};
    newVoices.forEach(voice => {
      const locale = voice.Locale;
      locales[locale] = (locales[locale] || 0) + 1;
    });
    
    console.log('');
    console.log('🌍 新增语音语言分布:');
    Object.entries(locales).forEach(([locale, count]) => {
      console.log(`  ${locale}: ${count} 个`);
    });

    // 重点分析2025年新功能
    console.log('');
    console.log('🎯 2025年重点新功能:');
    const dragonHD = newVoices.filter(v => v.VoiceType === 'DragonHD');
    const multiTalker = newVoices.filter(v => v.VoiceType === 'MultiTalker');
    const turbo = newVoices.filter(v => v.VoiceType === 'Turbo');
    
    if (dragonHD.length > 0) {
      console.log(`  🎵 DragonHD高质量语音: ${dragonHD.length} 个`);
      dragonHD.forEach(v => console.log(`    - ${v.ShortName} (${v.Gender})`));
    }
    
    if (multiTalker.length > 0) {
      console.log(`  👥 MultiTalker对话语音: ${multiTalker.length} 个`);
      multiTalker.forEach(v => console.log(`    - ${v.ShortName} (${v.Gender})`));
    }
    
    if (turbo.length > 0) {
      console.log(`  ⚡ Turbo快速合成: ${turbo.length} 个`);
      turbo.forEach(v => console.log(`    - ${v.ShortName} (${v.Gender})`));
    }
  }

} catch (error) {
  console.error('❌ 错误:', error.message);
}