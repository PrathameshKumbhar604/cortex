// Renders the app icon, Android adaptive-icon layers and splash mark from the web logo (apps/web/public/brand/cortex-logo.svg).
// Usage (from experimental/): node scripts/make-icons.mjs   (uses the repo's playwright-core and the system Chrome)
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const BG = "#5b47e0";
const FG = "#fbfaf7";
// The logo's glyph, in its own 24-unit box (from cortex-logo.svg, translate(4 4) removed).
const glyph = (stroke) =>
  `<g fill="none" stroke="${stroke}" stroke-width="2.4" stroke-linecap="round"><path d="M18.4 6.6A8.5 8.5 0 1 0 18.4 17.4"/><path d="M15.2 9.4A4.3 4.3 0 1 0 15.2 14.6"/><circle cx="12" cy="12" r="1.5" fill="${stroke}" stroke="none"/></g>`;

// scale = glyph size as a share of the canvas. Adaptive icons keep their glyph inside the central 66% safe zone.
const svg = ({ size, bg, rx = 0, stroke, scale }) => {
  const g = size * scale;
  const off = (size - g) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${
    bg ? `<rect width="${size}" height="${size}" rx="${rx}" fill="${bg}"/>` : ""
  }<g transform="translate(${off} ${off}) scale(${g / 24})">${glyph(stroke)}</g></svg>`;
};

const out = "assets/images";
mkdirSync(out, { recursive: true });
const files = [
  ["icon.png", svg({ size: 1024, bg: BG, stroke: FG, scale: 0.62 })],
  ["android-icon-foreground.png", svg({ size: 1024, stroke: FG, scale: 0.42 })],
  ["android-icon-monochrome.png", svg({ size: 1024, stroke: "#000000", scale: 0.42 })],
  ["splash-icon.png", svg({ size: 512, bg: BG, rx: 128, stroke: FG, scale: 0.62 })],
];

const browser = await chromium.launch({ channel: "chrome", headless: true });
for (const [name, markup] of files) {
  const size = Number(markup.match(/width="(\d+)"/)[1]);
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<html><body style="margin:0;background:transparent">${markup}</body></html>`);
  await page.screenshot({ path: `${out}/${name}`, omitBackground: true });
  await page.close();
}
await browser.close();
console.log("wrote", files.map((f) => f[0]).join(", "));
