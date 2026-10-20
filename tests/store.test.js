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
  store.setLevelStars(0, 1, 3, 'race');
  store.setLevelStars(0, 2, 2, 'race', true);
  assert.equal(store.unlockedLevel(0, 'race'), 3);
  assert.deepEqual(store.levelStars(0, 'race'), [3]);
  assert.deepEqual(store.levelStars(0, 'race', true), [0, 2]);
  store.recordBest('race-0', 15, true); store.recordBest('race-0', 22, true, true);
  assert.equal(store.getBest('race-0'), 15); assert.equal(store.getBest('race-0', true), 22);
  store.recordBest('daily-race-2026-10-20-1', 20, true, true);
  assert.equal(store.dailyStreak('2026-10-20'), 3);
  store.reset();
  assert.equal(store.getBest('race-0'), 15); assert.equal(store.getBest('race-0', true), 22);
  assert.equal(store.unlockedLevel(0, 'race'), 3);
  console.log('  ✓ 關燈／亮燈：解鎖共用，星數與成績分開，重設設定保留兩種紀錄');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
