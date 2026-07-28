/**
 * 匯出網頁版後,把 PWA 需要的標籤注入 dist/index.html。
 *
 * 為什麼需要:Expo 的網頁匯出只會產出 <link rel="icon" href="/favicon.ico">,
 * 而那個 favicon 只有 48x48。加到主畫面時瀏覽器找不到 manifest 的 icons,
 * 只能把 48px 放大到約 192px,結果就是糊的。Expo 沒有提供客製 index.html head
 * 的方式(非 expo-router 專案),所以在這裡補上。
 *
 * 這支腳本沒有任何依賴,而且可以重複執行(已注入過就跳過)。
 * 由 `npm run build:web` 自動執行——刻意綁在一起,避免變成容易漏掉的獨立步驟。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const INDEX = join(process.cwd(), 'dist', 'index.html');

const TAGS = [
  '<link rel="manifest" href="/manifest.json" />',
  '<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />',
  // iOS 沒有 manifest 支援,獨立顯示與標題要靠這幾個 meta
  '<meta name="apple-mobile-web-app-capable" content="yes" />',
  '<meta name="apple-mobile-web-app-status-bar-style" content="default" />',
  '<meta name="apple-mobile-web-app-title" content="Daily Bear" />',
];

if (!existsSync(INDEX)) {
  console.error('找不到 dist/index.html,請先執行 expo export --platform web');
  process.exit(1);
}

let html = readFileSync(INDEX, 'utf8');

if (html.includes('rel="manifest"')) {
  console.log('PWA 標籤已存在,略過');
  process.exit(0);
}

if (!html.includes('</head>')) {
  console.error('dist/index.html 沒有 </head>,Expo 的輸出格式可能變了');
  process.exit(1);
}

html = html.replace('</head>', `${TAGS.join('\n    ')}\n  </head>`);
writeFileSync(INDEX, html);

console.log('已注入 PWA 標籤:');
for (const t of TAGS) console.log(`  ${t}`);
