/* 單一 server URL 入口。部署時由 GitHub Actions 以 repo variable GAME_SERVER_URL（Render 後端 HTTPS URL）取代下行的佔位字串。
   單機模式完全不需要伺服器；本機以 node server.js 開啟時會自動使用同源伺服器。 */
window.MR_CONFIG = { serverUrl: '__GAME_SERVER_URL__', lobbyUrl: 'https://pjh-eric.github.io/game-lobby/' };
