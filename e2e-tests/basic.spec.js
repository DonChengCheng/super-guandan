const { test, expect } = require('@playwright/test');

test.describe('基础功能测试', () => {
  test('页面能够正常加载', async ({ page }) => {
    await page.goto('/');
    
    // 检查页面标题
    await expect(page).toHaveTitle('掼蛋在线游戏');
    
    // 检查游戏画布存在
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
  });

  test('Phaser 游戏引擎正常加载', async ({ page }) => {
    await page.goto('/');
    
    // 等待游戏加载
    await page.waitForTimeout(3000);
    
    // 检查 Phaser 对象存在
    const phaserExists = await page.evaluate(() => {
      return typeof window.Phaser !== 'undefined';
    });
    
    expect(phaserExists).toBe(true);
  });
});