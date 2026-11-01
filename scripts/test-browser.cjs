const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');

(async () => {
  const root = path.resolve(__dirname, '..');
  const evidence = path.resolve(process.env.GLASS_EVIDENCE || path.join(root, '.test-artifacts'));
  fs.mkdirSync(evidence, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}),
  });
  try {
    console.log(JSON.stringify({
      island: await require('../tests/glass-browser.cjs').run(browser, root, evidence),
      settings: await require('../tests/prefs-browser.cjs').run(browser, root, evidence),
    }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
