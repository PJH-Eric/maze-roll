const assert = require('node:assert/strict');

const saved = {
  best: {
    'daily-race-2026-10-19-4': 81.2,
    'daily-2026-10-18-2': 102.4,
    'dailys-race-2026-10-19-4': 3,
    'daily-race-2026-10-19-1': 74.8,
  },
};
global.localStorage = {
  getItem: (key) => key === 'maze-roll.v1' ? JSON.stringify(saved) : null,
  setItem: () => {},
};

(async () => {
  const { store } = await import('../public/js/store.js');
  assert.equal(store.dailyStreak('2026-10-19'), 2, 'race and legacy escape results count once per date');
  console.log('  ✓ 每日挑戰：兩種玩法共用連續天數，保留舊版逃出紀錄');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
