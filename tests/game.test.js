const assert = require('assert');
const MR = require('../public/js/rules.js');

global.window = { MR, MRAI: require('../public/js/ai.js') };

(async () => {
  const { Game } = await import('../public/js/game.js');

  for (const mode of ['race', 'escape', 'collapse']) {
    const world = new MR.World({
      mode,
      diff: 0,
      seed: 17,
      players: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    });
    const game = Object.create(Game.prototype);
    game.world = world;
    game.meId = 'a';
    game.follow = null;
    game.scene = { onEvent() {} };
    game.hooks = {};

    if (world.run) {
      world.byId.get('c').fin = 2;
    } else {
      world.byId.get('c').alive = false;
      world.byId.get('c').out = 2;
    }

    const event = world.run ? { e: 'finish', id: 'a', t: 1, place: 1 } : { e: 'out', id: 'a', t: 1 };
    game._event(event, true);
    assert.strictEqual(game.follow, 'b', mode + '：預設追蹤者結束後切到仍在遊戲的玩家');

    game.setFollow('a');
    assert.strictEqual(game._followId(), 'a', mode + '：手動點選已結束玩家仍可觀看');
  }

  console.log('鏡頭追蹤測試通過：3 種模式');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
