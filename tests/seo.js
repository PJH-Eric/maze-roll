'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { inject, validate } = require('../scripts/inject-seo');

const root = path.join(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'seo.config.json'), 'utf8'));
const gameplay = JSON.parse(fs.readFileSync(path.join(root, 'seo.gameplay.json'), 'utf8'));
const source = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const withoutGameplay = html => html
  .replace(/(?:\r?\n)?<!--SEO:GAMEPLAY-->[\s\S]*?<!--SEO:GAMEPLAY:END-->\s*/, '')
  .replace(/\r\n/g, '\n')
  .replace(/\n*<\/body>/i, '\n</body>');
validate(config);
assert.ok(source.includes('<!--SEO:HEAD-->'), 'HTML 要保留 SEO 產生標記');
assert.ok(source.includes('data-i18n-title="' + config.titleKey + '"'), '頁面標題要連結到翻譯 key');

const localeWindow = {};
localeWindow.window = localeWindow;
vm.runInNewContext(fs.readFileSync(path.join(root, 'public', 'js', 'locales.js'), 'utf8'), localeWindow);
assert.ok(localeWindow.MR_EN[config.titleKey], 'SEO 標題需有英文翻譯');
assert.ok(localeWindow.MR_HANS[config.titleKey], 'SEO 標題需有簡體中文翻譯');
assert.ok(localeWindow.MR_EN[config.descriptionKey], 'SEO 摘要需有英文翻譯');
assert.ok(localeWindow.MR_HANS[config.descriptionKey], 'SEO 摘要需有簡體中文翻譯');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'maze-roll-seo-'));
try {
  fs.mkdirSync(path.join(temp, 'public'));
  fs.writeFileSync(path.join(temp, 'seo.config.json'), JSON.stringify(config), 'utf8');
  fs.writeFileSync(path.join(temp, 'seo.gameplay.json'), JSON.stringify(gameplay), 'utf8');
  fs.writeFileSync(path.join(temp, 'public', 'index.html'), source, 'utf8');
  inject(temp);

  const built = fs.readFileSync(path.join(temp, 'public', 'index.html'), 'utf8');
  assert.equal((built.match(/<title>/g) || []).length, 1);
  assert.equal((built.match(/name="description"/g) || []).length, 1);
  assert.equal((built.match(/rel="canonical"/g) || []).length, 1);
  assert.ok(built.includes('href="' + config.siteUrl + '"'));
  assert.ok(built.includes('name="robots" content="index, follow, max-image-preview:large"'));
  assert.ok(built.includes('property="og:image" content="' + config.ogImage + '"'));
  assert.ok(built.includes('name="twitter:card" content="summary_large_image"'));
  assert.equal((built.match(/<!--SEO:GAMEPLAY-->/g) || []).length, 1);
  for (const locale of ['zh-Hant', 'zh-Hans', 'en']) {
    const entry = gameplay[locale];
    assert.ok(built.includes('<section lang="' + locale + '">'));
    for (const value of [entry.name, entry.summary, ...entry.modes, entry.controls]) assert.ok(built.includes(value));
  }
  assert.equal(
    withoutGameplay(built.slice(built.indexOf('</head>'))),
    withoutGameplay(source.slice(source.indexOf('</head>'))),
    'SEO 與玩法備援注入不得更動既有畫面 HTML'
  );

  const jsonLdText = built.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1];
  const jsonLd = JSON.parse(jsonLdText);
  assert.equal(jsonLd.url, config.siteUrl);
  assert.equal(jsonLd.applicationCategory, 'GameApplication');
  assert.equal(jsonLd.thumbnailUrl, config.ogImage);
  assert.ok(built.includes('property="og:image:type" content="image/webp"'));
  assert.ok(built.includes('property="og:image:height" content="675"'));
  assert.equal(jsonLd.isPartOf.url, config.lobbyUrl);

  const sitemap = fs.readFileSync(path.join(temp, 'public', 'sitemap.xml'), 'utf8');
  assert.equal((sitemap.match(/<loc>/g) || []).length, 1, '不建立新的語系網址');
  assert.ok(sitemap.includes('<loc>' + config.siteUrl + '</loc>'));
  const robots = fs.readFileSync(path.join(temp, 'public', 'robots.txt'), 'utf8');
  assert.ok(robots.includes('Allow: /'));
  assert.ok(robots.includes('Sitemap: ' + config.siteUrl + 'sitemap.xml'));
  inject(temp);
  assert.equal(fs.readFileSync(path.join(temp, 'public', 'index.html'), 'utf8'), built, '重複建置不得累積標籤');
  assert.throws(() => validate({ ...config, siteUrl: config.siteUrl.slice(0, -1) }), /siteUrl/);
  assert.throws(() => validate({ ...config, description: '太短', descriptionKey: '太短' }), /長度/);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}

console.log('✓ Maze Roll SEO metadata、三語玩法 HTML、robots、結構化資料與 sitemap 測試通過');
