const fs = require("fs/promises");
const path = require("path");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "marketing", "gold-oracle");

function profileSvg() {
  return `
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="goldGlow" cx="36%" cy="24%" r="70%">
      <stop offset="0%" stop-color="#ffe6a3"/>
      <stop offset="42%" stop-color="#f4c44f"/>
      <stop offset="100%" stop-color="#5d3b0f"/>
    </radialGradient>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#090b10"/>
      <stop offset="55%" stop-color="#151923"/>
      <stop offset="100%" stop-color="#080a0f"/>
    </linearGradient>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="28" stdDeviation="30" flood-color="#000000" flood-opacity="0.46"/>
    </filter>
  </defs>
  <rect width="1024" height="1024" rx="220" fill="url(#bg)"/>
  <circle cx="512" cy="512" r="340" fill="none" stroke="rgba(244,196,79,0.28)" stroke-width="2"/>
  <circle cx="512" cy="512" r="274" fill="rgba(244,196,79,0.08)" stroke="rgba(244,196,79,0.34)" stroke-width="5"/>
  <path d="M512 230 L668 320 L668 704 L512 794 L356 704 L356 320 Z" fill="rgba(20,24,32,0.92)" stroke="#f4c44f" stroke-width="10" filter="url(#shadow)"/>
  <path d="M512 316 C598 316 668 386 668 472 C668 588 512 714 512 714 C512 714 356 588 356 472 C356 386 426 316 512 316 Z" fill="url(#goldGlow)"/>
  <circle cx="512" cy="474" r="74" fill="#11151d"/>
  <circle cx="512" cy="474" r="38" fill="#f4c44f"/>
  <path d="M398 642 C466 604 558 604 626 642" fill="none" stroke="#11151d" stroke-width="26" stroke-linecap="round"/>
  <text x="512" y="900" text-anchor="middle" fill="#f7f0dd" font-family="Segoe UI, Arial, sans-serif" font-size="72" font-weight="900" letter-spacing="0">Gold Oracle</text>
</svg>`;
}

function coverSvg() {
  return `
<svg width="1640" height="624" viewBox="0 0 1640 624" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#07090d"/>
      <stop offset="45%" stop-color="#121722"/>
      <stop offset="100%" stop-color="#090b10"/>
    </linearGradient>
    <radialGradient id="glow" cx="22%" cy="18%" r="80%">
      <stop offset="0%" stop-color="rgba(244,196,79,0.46)"/>
      <stop offset="45%" stop-color="rgba(244,196,79,0.10)"/>
      <stop offset="100%" stop-color="rgba(244,196,79,0)"/>
    </radialGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="22" stdDeviation="24" flood-color="#000000" flood-opacity="0.45"/>
    </filter>
  </defs>
  <rect width="1640" height="624" fill="url(#bg)"/>
  <rect width="1640" height="624" fill="url(#glow)"/>
  <g opacity="0.22">
    <path d="M0 462 C160 420 230 486 390 442 C540 402 628 328 792 360 C930 388 1010 488 1156 450 C1312 410 1402 294 1640 332" fill="none" stroke="#6aa7ff" stroke-width="3"/>
    <path d="M0 420 C164 380 240 438 390 408 C536 378 628 300 780 324 C932 348 1016 444 1162 406 C1320 365 1410 250 1640 292" fill="none" stroke="#f4c44f" stroke-width="3"/>
  </g>
  <g transform="translate(1030 86)" filter="url(#shadow)">
    <rect x="0" y="0" width="446" height="360" rx="22" fill="rgba(20,24,32,0.92)" stroke="rgba(255,255,255,0.12)"/>
    <text x="32" y="54" fill="#9ca7ba" font-family="Segoe UI, Arial, sans-serif" font-size="24">AI Signal</text>
    <text x="32" y="130" fill="#ff6b6b" font-family="Segoe UI, Arial, sans-serif" font-size="86" font-weight="900">SELL</text>
    <circle cx="354" cy="92" r="52" fill="none" stroke="#ff6b6b" stroke-width="10"/>
    <text x="354" y="88" text-anchor="middle" fill="#ffffff" font-family="Segoe UI, Arial, sans-serif" font-size="30" font-weight="900">77%</text>
    <text x="354" y="116" text-anchor="middle" fill="#9ca7ba" font-family="Segoe UI, Arial, sans-serif" font-size="14">confidence</text>
    <rect x="32" y="178" width="112" height="72" rx="10" fill="#202632" stroke="rgba(255,255,255,0.12)"/>
    <rect x="166" y="178" width="112" height="72" rx="10" fill="#202632" stroke="rgba(255,255,255,0.12)"/>
    <rect x="300" y="178" width="112" height="72" rx="10" fill="#202632" stroke="rgba(255,255,255,0.12)"/>
    <text x="46" y="206" fill="#9ca7ba" font-family="Segoe UI, Arial, sans-serif" font-size="15">Entry</text>
    <text x="46" y="236" fill="#ffffff" font-family="Segoe UI, Arial, sans-serif" font-size="24" font-weight="800">4,543</text>
    <text x="180" y="206" fill="#9ca7ba" font-family="Segoe UI, Arial, sans-serif" font-size="15">TP</text>
    <text x="180" y="236" fill="#42d392" font-family="Segoe UI, Arial, sans-serif" font-size="24" font-weight="800">4,473</text>
    <text x="314" y="206" fill="#9ca7ba" font-family="Segoe UI, Arial, sans-serif" font-size="15">SL</text>
    <text x="314" y="236" fill="#ff6b6b" font-family="Segoe UI, Arial, sans-serif" font-size="24" font-weight="800">4,575</text>
    <path d="M42 304 H404" stroke="#ffffff" stroke-width="2" stroke-dasharray="10 8"/>
    <path d="M42 328 H404" stroke="#42d392" stroke-width="2" stroke-dasharray="10 8"/>
    <path d="M42 280 H404" stroke="#ff6b6b" stroke-width="2" stroke-dasharray="10 8"/>
  </g>
  <g transform="translate(104 102)">
    <rect x="0" y="0" width="86" height="86" rx="18" fill="rgba(244,196,79,0.12)" stroke="rgba(244,196,79,0.55)"/>
    <text x="43" y="57" text-anchor="middle" fill="#f4c44f" font-family="Segoe UI, Arial, sans-serif" font-size="34" font-weight="900">GO</text>
    <text x="0" y="176" fill="#ffffff" font-family="Segoe UI, Arial, sans-serif" font-size="86" font-weight="900">Gold Oracle</text>
    <text x="0" y="228" fill="#f4c44f" font-family="Segoe UI, Arial, sans-serif" font-size="34" font-weight="800">AI Gold Signal Assistant</text>
    <text x="0" y="286" fill="#dbe2ee" font-family="Segoe UI, Arial, sans-serif" font-size="30">Realtime chart • GPT-assisted insight • Entry / TP / SL</text>
    <g transform="translate(0 344)">
      <rect x="0" y="0" width="168" height="48" rx="24" fill="rgba(66,211,146,0.14)" stroke="rgba(66,211,146,0.45)"/>
      <text x="84" y="32" text-anchor="middle" fill="#bbffd9" font-family="Segoe UI, Arial, sans-serif" font-size="20" font-weight="800">AI Hybrid v2</text>
      <rect x="188" y="0" width="154" height="48" rx="24" fill="rgba(106,167,255,0.14)" stroke="rgba(106,167,255,0.45)"/>
      <text x="265" y="32" text-anchor="middle" fill="#d8e9ff" font-family="Segoe UI, Arial, sans-serif" font-size="20" font-weight="800">Trade Plan</text>
      <rect x="362" y="0" width="132" height="48" rx="24" fill="rgba(244,196,79,0.14)" stroke="rgba(244,196,79,0.45)"/>
      <text x="428" y="32" text-anchor="middle" fill="#ffe5a4" font-family="Segoe UI, Arial, sans-serif" font-size="20" font-weight="800">XAU/USD</text>
    </g>
  </g>
  <text x="104" y="574" fill="#9ca7ba" font-family="Segoe UI, Arial, sans-serif" font-size="22">Educational tool only. Not investment advice.</text>
</svg>`;
}

async function writeTextAssets() {
  const pageText = `ชื่อเพจ: Gold Oracle

หมวดหมู่: Software / Financial service / Investing service

คำอธิบายเพจ:
Gold Oracle คือผู้ช่วยวิเคราะห์กราฟทองคำด้วย AI สำหรับ XAU/USD และ Gold Futures ใช้แนวคิด GPT-assisted intelligence ร่วมกับ AI Hybrid v2 เพื่อช่วยสรุปสัญญาณ BUY / SELL / WAIT พร้อม Entry, Take Profit, Stop Loss, MACD, Bollinger Bands, ATR และ Trade Plan Overlay บนกราฟ

โพสต์เปิดตัว:
เปิดตัว Gold Oracle
ผู้ช่วยวิเคราะห์กราฟทองคำด้วย AI สำหรับคนที่อยากอ่านตลาดอย่างเป็นระบบขึ้น

ฟีเจอร์หลัก:
- วิเคราะห์กราฟทองคำแบบ realtime-ish
- AI Hybrid v2 ช่วยประเมิน BUY / SELL / WAIT
- วาด Entry, Take Profit, Stop Loss บนกราฟ
- มี MACD, Bollinger Bands, ATR และ crosshair แบบ TradingView
- อธิบายเหตุผลของสัญญาณเป็นภาษาคน

เหมาะสำหรับ:
- คนเทรดทอง XAU/USD
- คนที่อยากมี AI ช่วยอ่านกราฟ
- คนที่ต้องการเห็นแผนเทรดก่อนตัดสินใจ

สนใจทดลองหรือดูเดโม ทักแชทได้เลย

หมายเหตุ: เครื่องมือนี้เป็นผู้ช่วยวิเคราะห์เพื่อการศึกษาและการตัดสินใจอย่างมีระบบ ไม่ใช่คำแนะนำการลงทุน ไม่รับประกันผลกำไร และไม่ได้เป็นผลิตภัณฑ์อย่างเป็นทางการของ OpenAI หรือ ChatGPT
`;
  await fs.writeFile(path.join(outDir, "facebook-page-copy.txt"), pageText, "utf8");
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, "gold-oracle-profile.svg"), profileSvg(), "utf8");
  await fs.writeFile(path.join(outDir, "gold-oracle-cover.svg"), coverSvg(), "utf8");
  await sharp(Buffer.from(profileSvg())).png().toFile(path.join(outDir, "gold-oracle-profile.png"));
  await sharp(Buffer.from(coverSvg())).png().toFile(path.join(outDir, "gold-oracle-cover.png"));
  await writeTextAssets();
  console.log(outDir);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
