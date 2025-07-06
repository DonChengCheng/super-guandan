const { test, expect } = require('@playwright/test');

test.describe('掼蛋游戏', () => {
  test('游戏页面应该正常加载', async ({ page }) => {
    await page.goto('/');
    
    // 检查页面标题
    await expect(page).toHaveTitle('掼蛋在线游戏');
    
    // 检查游戏画布存在
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
    
    // 检查连接状态指示器
    const connectionStatus = page.locator('text=/🟢|🟡|🔴|⚠️/');
    await expect(connectionStatus).toBeVisible();
  });

  test('连接状态应该显示为已连接', async ({ page }) => {
    await page.goto('/');
    
    // 等待连接建立
    await page.waitForTimeout(2000);
    
    // 检查连接状态
    const connectionStatus = page.locator('text=/🟢.*已连接|🟢.*已重连/');
    await expect(connectionStatus).toBeVisible({ timeout: 10000 });
  });

  test('应该显示等待玩家的状态', async ({ page }) => {
    await page.goto('/');
    
    // 等待游戏加载
    await page.waitForTimeout(3000);
    
    // 检查状态文字
    const statusText = page.locator('text=/等待|已连接|分配/');
    await expect(statusText).toBeVisible();
  });

  test('Socket.IO 应该正常连接', async ({ page }) => {
    await page.goto('/');
    
    // 等待 Socket.IO 连接
    await page.waitForTimeout(3000);
    
    // 检查 Socket.IO 对象存在且已连接
    const socketStatus = await page.evaluate(() => {
      return {
        exists: typeof window.socket !== 'undefined',
        connected: window.socket?.connected || false
      };
    });
    
    expect(socketStatus.exists).toBe(true);
    expect(socketStatus.connected).toBe(true);
  });
});