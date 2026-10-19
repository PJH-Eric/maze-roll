/* 部署時由 GitHub Actions 注入 server URL 與 GA4 Measurement ID。
   單機模式不需要伺服器；本機以 node server.js 開啟時會自動使用同源伺服器。 */
window.MR_CONFIG = { serverUrl: '__GAME_SERVER_URL__', ga4MeasurementId: '__GA4_MEASUREMENT_ID__', lobbyUrl: 'https://pjh-eric.github.io/game-lobby/' };
