'use strict';

const fs = require('fs');
const path = require('path');

const START = '<!--SEO:HEAD-->';
const END = '<!--SEO:END-->';
const GAMEPLAY_START = '<!--SEO:GAMEPLAY-->';
const GAMEPLAY_END = '<!--SEO:GAMEPLAY:END-->';
const GAMEPLAY_LOCALES = {
  'zh-Hant': { modes: '玩法模式', controls: '操作方式', separator: '、' },
  'zh-Hans': { modes: '玩法模式', controls: '操作方式', separator: '、' },
  en: { modes: 'Game modes', controls: 'How to play', separator: ', ' }
};

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function safeJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

function validate(config) {
  for (const key of ['id', 'siteUrl', 'lobbyUrl', 'title', 'titleKey', 'description', 'descriptionKey', 'genre', 'players']) {
    if (typeof config[key] !== 'string' || !config[key].trim()) {
      throw new Error('seo.config.json 缺少欄位：' + key);
    }
  }

  if (!/^[a-z0-9-]+$/.test(config.id) || config.siteUrl !== 'https://pjh-eric.github.io/' + config.id + '/') {
    throw new Error('siteUrl 必須是遊戲自己的 HTTPS 網址，並以 / 結尾');
  }
  if (config.lobbyUrl !== 'https://pjh-eric.github.io/game-lobby/') {
    throw new Error('lobbyUrl 格式錯誤');
  }
  if (config.title !== config.titleKey || config.description !== config.descriptionKey) {
    throw new Error('SEO 文案必須與繁體中文翻譯 key 相同');
  }
  if (config.title.length < 8 || config.title.length > 40 || config.description.length < 40 || config.description.length > 160) {
    throw new Error('SEO 標題或摘要長度錯誤');
  }

  for (const key of ['iconUrl', 'ogImage']) {
    if (config[key] && (!config[key].startsWith(config.siteUrl) || !/^https:\/\//.test(config[key]))) {
      throw new Error(key + ' 必須是遊戲自己的 HTTPS 網址');
    }
  }
  if (config.ogImage && !/\/assets\/images\/cover\.webp$/.test(config.ogImage)) throw new Error('ogImage 必須指向 WebP 遊戲封面');
}

function validateGameplay(gameplay) {
  for (const locale of Object.keys(GAMEPLAY_LOCALES)) {
    const entry = gameplay && gameplay[locale];
    const hasTextFields = entry && ['name', 'summary', 'controls']
      .every(key => typeof entry[key] === 'string' && entry[key].trim());
    const hasValidModes = entry && Array.isArray(entry.modes) && entry.modes.length &&
      entry.modes.every(mode => typeof mode === 'string' && mode.trim());
    if (!hasTextFields || !hasValidModes) {
      throw new Error('seo.gameplay.json 缺少完整語系或玩法欄位：' + locale);
    }
  }
}

function makeGameplay(gameplay) {
  validateGameplay(gameplay);
  const sections = Object.entries(GAMEPLAY_LOCALES).map(([locale, labels]) => {
    const entry = gameplay[locale];
    const punctuation = locale === 'en' ? ': ' : '：';
    return [
      '<section lang="' + locale + '">',
      '<h2>' + escapeHtml(entry.name) + '</h2>',
      '<p>' + escapeHtml(entry.summary) + '</p>',
      '<p><strong>' + labels.modes + punctuation + '</strong>' + entry.modes.map(escapeHtml).join(labels.separator) + '</p>',
      '<p><strong>' + labels.controls + punctuation + '</strong>' + escapeHtml(entry.controls) + '</p>',
      '</section>'
    ].join('\n');
  });
  return [GAMEPLAY_START, '<noscript><div class="seo-gameplay">' + sections.join('\n') + '</div></noscript>', GAMEPLAY_END].join('\n');
}

function makeHead(config) {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: '迷宮滾球',
    url: config.siteUrl,
    description: config.description,
    applicationCategory: 'GameApplication',
    operatingSystem: 'Any',
    inLanguage: 'zh-Hant',
    genre: config.genre,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'TWD' },
    image: config.ogImage || undefined,
    thumbnailUrl: config.ogImage || undefined,
    isPartOf: { '@type': 'WebSite', url: config.lobbyUrl }
  };
  const title = escapeHtml(config.title);
  const description = escapeHtml(config.description);
  const image = escapeHtml(config.ogImage);

  return [
    START,
    '<title>' + title + '</title>',
    '<meta name="description" data-i18n-content="' + escapeHtml(config.descriptionKey) + '" content="' + description + '">',
    '<link rel="canonical" href="' + escapeHtml(config.siteUrl) + '">',
    '<meta name="robots" content="index, follow, max-image-preview:large">',
    '<meta property="og:type" content="website">',
    '<meta property="og:locale" content="zh_TW">',
    '<meta property="og:site_name" content="迷宮滾球">',
    '<meta property="og:title" content="' + title + '">',
    '<meta property="og:description" content="' + description + '">',
    '<meta property="og:url" content="' + escapeHtml(config.siteUrl) + '">',
    '<meta property="og:image" content="' + image + '">',
    '<meta property="og:image:type" content="image/webp">',
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="675">',
    '<meta property="og:image:alt" content="' + escapeHtml(config.ogImageAlt || config.title) + '">',
    '<meta name="twitter:card" content="summary_large_image">',
    '<meta name="twitter:title" content="' + title + '">',
    '<meta name="twitter:description" content="' + description + '">',
    '<meta name="twitter:image" content="' + image + '">',
    '<meta name="twitter:image:alt" content="' + escapeHtml(config.ogImageAlt || config.title) + '">',
    '<script type="application/ld+json">' + safeJson(structuredData) + '</script>',
    END
  ].join('\n');
}

function inject(root) {
  const configPath = path.join(root, 'seo.config.json');
  const gameplayPath = path.join(root, 'seo.gameplay.json');
  const indexPath = path.join(root, 'public', 'index.html');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const gameplay = JSON.parse(fs.readFileSync(gameplayPath, 'utf8'));
  validate(config);
  validateGameplay(gameplay);

  let html = fs.readFileSync(indexPath, 'utf8');
  if (html.split(START).length !== 2 || html.split(END).length !== 2) {
    throw new Error('index.html 必須各有一組 SEO 標記');
  }
  if (!/<html\b[^>]*data-i18n-title=/i.test(html)) {
    throw new Error('index.html 缺少多語系標題 key');
  }
  html = html.replace(/<!--SEO:HEAD-->[\s\S]*?<!--SEO:END-->/, makeHead(config));
  html = html.replace(/\r?\n?<!--SEO:GAMEPLAY-->[\s\S]*?<!--SEO:GAMEPLAY:END-->\r?\n?/g, '\n');
  if (!/<\/body>/i.test(html)) {
    throw new Error('index.html 缺少 </body>');
  }
  html = html.replace(/(?:\r?\n)*<\/body>/i, '\n' + makeGameplay(gameplay) + '\n</body>');

  const sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    '  <url><loc>' + escapeXml(config.siteUrl) + '</loc></url>\n' +
    '</urlset>\n';
  fs.writeFileSync(indexPath, html, 'utf8');
  fs.writeFileSync(path.join(root, 'public', 'sitemap.xml'), sitemap, 'utf8');
  fs.writeFileSync(path.join(root, 'public', 'robots.txt'),
    'User-agent: *\nAllow: /\n\nSitemap: ' + escapeHtml(config.siteUrl) + 'sitemap.xml\n', 'utf8');
  return config;
}

module.exports = { inject, makeGameplay, makeHead, validate, validateGameplay };

if (require.main === module) {
  try {
    const config = inject(path.join(__dirname, '..'));
    console.log('✓ SEO metadata 與 sitemap.xml 已產生：' + config.id);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
