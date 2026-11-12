# 迷宮滾球 SEO 與宣傳圖

2026-11-12 更新。使用內建 image_gen 分別生成兩張插畫，保留原圖；以 Sharp 等比例縮放、必要時留邊，不拉伸或裁切文字。

- `../../public/og-image.png`：1200 × 630 PNG，含正式繁中標題與「遊戲小小島」品牌；供 Open Graph、Twitter 與 JSON-LD image 使用。
- `../../public/assets/images/cover.webp`：1200 × 675 WebP，無文字封面；保留原路徑，供大廳卡片與 JSON-LD thumbnailUrl 使用。
- `seo-source.png`、`cover-source.png`：生成原圖。

SEO 文案以 `seo.config.json` 為來源，透過 `node scripts/inject-seo.js` 產生靜態 metadata。遊戲載入後沿用 HTML 的翻譯 key，避免靜態與動態摘要分歧；繁中、簡中、英文均有對應翻譯。

## SEO 圖提示詞

Use case: ads-marketing. Create premium landscape 1200x630 social sharing artwork for a browser game named 迷宮滾球. Warm ivory background, soft clay-like 3D illustration with a tactile honey oak wooden labyrinth on the left, rounded wooden maze walls, a glossy teal rolling marble in an open corridor, a few golden star pickups and a small coral finish flag. Clear physical wooden maze paths, sophisticated playful toy photography, gentle warm studio light and natural soft shadows. Right side large perfectly legible Traditional Chinese title in dark warm brown: "迷宮滾球", arranged in two lines "迷宮" then "滾球". Small brand below: "遊戲小小島". Editorial spacious composition, balanced 55/45 picture/text, 10 percent safe margins, cream, honey wood, teal and coral palette. All title characters must be exact Traditional Chinese. No other text, no buttons, no score, no watermark. Landscape ratio 1.905:1.

## Cover 提示詞

Use case: ads-marketing. Create an independently composed 16:9 landscape cover illustration for the wooden labyrinth ball game 迷宮滾球. No text anywhere. Center a beautiful floating honey oak wooden maze tray seen from elevated three-quarter view, its rounded chunky walls forming coherent wide corridors. A large glossy teal marble rolls along the foreground corridor, with two small coral and pale blue marbles elsewhere in the maze, a few collectible gold stars and a small coral finish flag near a round goal hole. Premium soft clay-like 3D toy illustration, subtle wood grain, warm ivory background with gentle soft shadows, natural warm studio lighting. Spacious carefully balanced composition, all important subjects within 10 percent safe margins, clear recognizable silhouette at thumbnail size, honey wood, cream, teal and coral palette. Emphasize rolling-ball maze gameplay. No typography, no logos, no letters, no UI, no score, no watermark. Output landscape 16:9.
