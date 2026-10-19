// GA4：僅部署時有有效 Measurement ID 才載入 Google tag。本機／未設定時不送出資料。
(() => {
  const id = String(window.MR_CONFIG?.ga4MeasurementId || '').trim();
  const analytics = { pageView() {} };
  window.MR_ANALYTICS = analytics;
  if (location.hostname !== 'pjh-eric.github.io' || !/^G-[A-Z0-9]{6,}$/i.test(id)) return;

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.append(script);

  window.gtag('js', new Date());
  window.gtag('config', id, {
    game_id: 'maze-roll',
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });

  let activeScreen = '';
  analytics.pageView = (screen) => {
    const name = String(screen || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 40);
    if (!name || name === activeScreen) return;
    activeScreen = name;
    // 不傳送網址的 query/hash，避免把邀請 token 等資料放進分析事件。
    const pagePath = `${location.pathname}#/${name}`;
    window.gtag('event', 'page_view', {
      page_title: `${document.title} - ${name}`,
      page_location: `${location.origin}${pagePath}`,
      page_path: pagePath,
      screen_name: name,
    });
  };
})();
