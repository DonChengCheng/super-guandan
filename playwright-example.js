const { chromium } = require('@playwright/test');

(async () => {
  // Launch browser
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Navigate to example.com
  console.log('Navigating to example.com...');
  await page.goto('https://example.com');

  // Wait for the page to load
  await page.waitForLoadState('networkidle');

  // Take a screenshot
  await page.screenshot({ path: 'example.png' });

  // Get the page title
  const title = await page.title();
  console.log('Page title:', title);

  // Get the main heading text
  const heading = await page.textContent('h1');
  console.log('Main heading:', heading);

  // Keep the browser open for 5 seconds to see the page
  console.log('Browser will stay open for 5 seconds...');
  await page.waitForTimeout(5000);

  // Close browser
  await browser.close();
  console.log('Browser closed');
})();