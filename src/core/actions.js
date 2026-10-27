// Действия экранов (карточки, сундук скиллов, лут босса, пауза, конец овертайма) одним интерфейсом
// для соло и коопа.
// Соло: сразу вызывают sim. Кооп: уходят командами в lockstep и применяются у обоих клиентов на одном тике,
// поэтому экраны не ждут результата, а следят за sim.state в update(). Без Phaser.

/**
 * @param {!Object} sim
 * @param {?Object=} ls lockstep (core/lockstep.js) в коопе, иначе null
 * @return {!Object} { coop, local, card, reroll, skip, banish, chestOk, lootDone, pause, resume, finish, hold,
 *     paused }
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
      chestOk: () => sim.chestOk(0), // сундук скиллов: показ закрыт
      lootDone: () => sim.lootFinish(0), // экран лута: решения по предметам уже в стеше, мир идёт дальше
      pause: () => {},
      resume: () => {},
      finish: () => sim.finishOvertime(),
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
    chestOk: () => cmd('chestOk'), // кооп: мир трогается у обоих, когда закрыли оба
    lootDone: () => cmd('lootDone'), // кооп: мир трогается у обоих, когда закончили оба
    pause: () => cmd('pause'),
    resume: () => cmd('resume'),
    finish: () => cmd('finish'),
    hold: () => {}, // кооп: паузу после выбора ставит сим у обоих
    get paused() { return ls.paused; },
  };
}
