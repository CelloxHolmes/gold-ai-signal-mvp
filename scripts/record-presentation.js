const path = require("path");
const fs = require("fs/promises");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const presentationPath = path.join(root, "presentation", "gold-ai-signal-presentation.html");
const outputDir = path.join(root, "presentation", "recordings");
const finalPath = path.join(root, "presentation", "gold-ai-signal-demo.webm");
const chromeCandidates = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
];

async function findBrowserExecutable() {
  for (const candidate of chromeCandidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try the next installed browser.
    }
  }
  return null;
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.USE_SYSTEM_BROWSER ? await findBrowserExecutable() : undefined,
    headless: process.env.HEADED ? false : true,
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: {
      dir: outputDir,
      size: { width: 1280, height: 720 },
    },
  });
  const page = await context.newPage();
  await page.goto(`file://${presentationPath.replace(/\\/g, "/")}`);
  await page.waitForTimeout(43000);
  const video = page.video();
  await context.close();
  await browser.close();

  const tempPath = await video.path();
  await fs.copyFile(tempPath, finalPath);
  console.log(finalPath);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
