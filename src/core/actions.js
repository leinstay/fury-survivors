// Действия экранов (карточки, сундук, пауза, конец овертайма) одним интерфейсом для соло и коопа.
// Соло: сразу вызывают sim. Кооп: уходят командами в lockstep и применяются у обоих клиентов на одном тике,
// поэтому экраны не ждут результата, а следят за sim.state в update(). Без Phaser.

/**
 * @param {!Object} sim
 * @param {?Object=} ls lockstep (core/lockstep.js) в коопе, иначе null
 * @return {!Object} { coop, local, card, reroll, skip, banish, chest, skipChest, pause, resume, finish,
 *     revealDone, hold, paused }
 */
export function createActions(sim, ls = null) {
  const cmd = (k, i) => ls.command(i === undefined ? { k } : { k, i });
  if (!ls) {
    return {
      coop: false, local: 0,
      card: (i) => sim.chooseCard(i),
      reroll: () => sim.reroll(),
      skip: () => sim.skip(),
      banish: (i) => sim.banish(i),
      chest: (i) => sim.chooseChest(i),
      skipChest: () => sim.skipChest(),
      pause: () => {},
      resume: () => {},
      finish: () => sim.finishOvertime(),
      revealDone: () => sim.endReveal(),
      hold: () => sim.resumeDelay(), // соло: после экрана мир стоит SIM.resumeDelay
      get paused() { return false; },
    };
  }
  return {
    coop: true, local: ls.local,
    card: (i) => cmd('card', i),
    reroll: () => cmd('reroll'),
    skip: () => cmd('skip'),
    banish: (i) => cmd('banish', i),
    chest: (i) => cmd('chest', i),
    skipChest: () => cmd('skipChest'),
    pause: () => cmd('pause'),
    resume: () => cmd('resume'),
    finish: () => cmd('finish'),
    revealDone: () => cmd('revealDone'),
    hold: () => {}, // кооп: паузу после выбора ставит сим у обоих
    get paused() { return ls.paused; },
  };
}
