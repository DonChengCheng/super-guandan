const fs = require('fs');
const path = require('path');

// 测试生成的素材文件
const assetsDir = path.join(__dirname, 'client', 'assets');
const requiredAssets = [
    'cards.png',
    'card_back.png',
    'play_button.png',
    'pass_button.png',
    'tribute_button.png'
];

console.log('🎮 检查游戏素材...\n');

requiredAssets.forEach(asset => {
    const assetPath = path.join(assetsDir, asset);
    
    if (fs.existsSync(assetPath)) {
        const stats = fs.statSync(assetPath);
        console.log(`✅ ${asset}`);
        console.log(`   📁 大小: ${(stats.size / 1024).toFixed(2)} KB`);
        console.log(`   📅 修改时间: ${stats.mtime.toLocaleString()}`);
        console.log('');
    } else {
        console.log(`❌ ${asset} - 文件不存在`);
        console.log('');
    }
});

// 检查精灵表特殊规格
const cardsPath = path.join(assetsDir, 'cards.png');
if (fs.existsSync(cardsPath)) {
    console.log('🃏 卡牌精灵表验证:');
    console.log('   📐 应为: 840×635 像素');
    console.log('   🎯 帧数: 108 帧 (12×9 网格)');
    console.log('   📏 单帧: 70×95 像素');
    console.log('   🗂️ 排列: 两副牌 + 4张王牌');
    console.log('');
}

console.log('🎯 素材检查完成！');
console.log('💡 提示: 访问 client/asset_preview.html 查看详细预览');