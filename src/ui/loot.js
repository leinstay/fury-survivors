// Лут с боссов: экран сразу после босса (сцена Loot поверх Game, sim.state 'loot'). Экрана после забега нет:
// что осталось без решения (смерть в кадр убийства, дисконнект в коопе), берётся в стеш само (claimPendingLoot).
// По сундуку на страницу, в каждом CHEST_SIZE записей. Предмет: «Взять» (в стеш) или «Разобрать (+n)»
// (сразу кристаллы, disassembleValue). Решить надо по каждому: Esc не закрывает, «Дальше» — когда решено всё.
// Свитки и сердца хаоса берутся сами при открытии экрана.
// Стеш полон: под «Взять» видно, что исчезнет (previewEvict); вытесненный предмет разбирается в кристаллы.
// Лут лежит в sim.players[i].loot (src/core/sim.js), решения — в сундуке (c.ui, вне хеша сима), инвентарь
// сохраняется через services/inventory.js; разбор (и вытеснение) считается в ачивку recycler.
import { t } from '../i18n/index.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../data/constants.js';
import { BOSSES } from '../data/bosses.js';
import { FocusNav, addButton } from './focus.js';
import { BUTTON, rowXs, overlayTitle } from './menu-layout.js';
import { addPanel } from './panel.js';
import { textStyle, COLORS } from './style.js';
import { createRng } from '../core/rng.js';
import {
  previewEvict, stashFull, addCurrency, newUid, affixLines, disassembleValue,
} from '../core/items.js';
import { takeLoot, hasUid, disassembleLoot } from '../core/inventory.js';
import { getInventory, setInventory } from '../services/inventory.js';
import { checkMetaAchievements } from '../services/achievements.js';
import { drawItemBox, itemTitle, affixText, RARITY_CSS } from './items.js';

const CARD = { w: 196, h: 226, y: 64, gap: 8 };
// Заголовок поверх забега — overlayTitle (ui/menu-layout.js). Под ним строка сундука и сердца, затем карточки
// (до 290) и ряд кнопок.
const SUB_Y = 45;
const HEARTS_Y = 55;
const ROW_W = 150; // кнопки нижнего ряда: Take all, Disassemble all, Continue

const bossName = (id) => (BOSSES[id] ? t(`boss.${id}.name`) : '?');

// Решено ли всё в сундуке (свитки — сами).
function chestDone(c) {
  return !!c.ui && c.ui.state.every(Boolean);
}

function localPlayer(sim) {
  return sim && (sim.players[sim.local] || sim.player);
}

// Свитки и сердца сундуков — сразу в кошелёк (один раз на сундук: c.ui создаётся здесь).
function initChests(chests) {
  let hearts = 0;
  let scrolls = 0;
  for (const c of chests) {
    if (c.ui) continue;
    c.ui = { state: c.entries.map((e) => (e.kind === 'scroll' ? 'auto' : null)) };
    hearts += c.hearts || 0;
    for (const e of c.entries) if (e.kind === 'scroll') scrolls++;
  }
  const inv = getInventory();
  if (!hearts && !scrolls) return inv;
  return setInventory({ ...inv, wallet: addCurrency(inv.wallet, { hearts, scrolls }) });
}

const randomRng = () => createRng((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0);

/**
 * Лут своего игрока без решения — в стеш без экрана (экран закрыт до решения: дисконнект, конец забега).
 * Полный стеш: вытесняется предмет по previewEvict; всё залочено — предмет разбирается в кристаллы.
 * @param {!Object} sim
 * @return {!Array<string>} ids полученных ачивок
 */
export function claimPendingLoot(sim) {
  const me = localPlayer(sim);
  const chests = ((me && me.loot) || []).filter((c) => !chestDone(c));
  if (!chests.length) return [];
  const rng = randomRng();
  let inv = initChests(chests);
  let dis = 0;
  for (const c of chests) {
    c.entries.forEach((e, ei) => {
      if (c.ui.state[ei]) return;
      let item = e.item;
      if (hasUid(inv, item.uid)) item = { ...item, uid: newUid(rng) };
      const r = takeLoot(inv, item, previewEvict(inv.stash, rng));
      if (r.ok) {
        inv = r.inv;
        if (r.evicted) dis++;
        c.ui.state[ei] = 'taken';
      } else {
        inv = disassembleLoot(inv, item).inv;
        dis++;
        c.ui.state[ei] = 'dis';
      }
    });
  }
  setInventory(inv, { backup: true });
  return checkMetaAchievements(dis ? { disassembled: dis } : null).unlocked;
}

/** Есть ли у своего игрока лут без решения. */
export function hasPendingLoot(sim) {
  const me = localPlayer(sim);
  return !!(me && me.loot && me.loot.some((c) => !chestDone(c)));
}

/**
 * Экран лута: сундуки своего игрока, по которым решение не принято. onDone(unlocked) — когда решено всё
 * (ids полученных ачивок за стеш и разбор). Нечего решать — onDone сразу.
 * @param {!Phaser.Scene} scene
 * @param {!Object} sim
 * @param {function(!Array<string>)} onDone
 * @return {!FocusNav} навигация экрана (update(time) из сцены)
 */
export function buildLoot(scene, sim, onDone) {
  const me = localPlayer(sim);
  const pages = ((me && me.loot) || []).filter((c) => !chestDone(c));
  if (!pages.length) {
    onDone([]);
    return { items: [], update() {} };
  }
  const rng = randomRng();
  let inv = initChests(pages);

  const unlocked = [];
  const evict = {};
  let idx = 0;
  let msg = '';
  let msgColor = '#dddddd';
  let objs = [];
  let finished = false;
  const nav = new FocusNav(scene, {}); // без onBack: Esc не закрывает, решить надо по каждому предмету

  // Разбор (кнопкой или вытеснением из полного стеша) — счётчик ачивки recycler; инвентарь мог измениться
  // наградой ачивки, поэтому перечитывается.
  const countDisassembled = (n) => {
    const res = checkMetaAchievements({ disassembled: n });
    unlocked.push(...res.unlocked);
    inv = getInventory();
  };

  const evictFor = (key) => {
    if (!stashFull(inv.stash)) return null;
    const cur = evict[key];
    if (cur && inv.stash.some((x) => x.uid === cur && !x.locked)) return cur;
    evict[key] = previewEvict(inv.stash, rng);
    return evict[key];
  };

  // Взять предмет ei текущего сундука. false — не вышло (стеш полон и всё залочено).
  const takeOne = (ei) => {
    const c = pages[idx];
    let item = c.entries[ei].item;
    if (hasUid(inv, item.uid)) item = { ...item, uid: newUid(rng) }; // тот же seed уже давал этот предмет
    const ev = evictFor(`${idx}:${ei}`);
    const evName = ev ? itemTitle(inv.stash.find((x) => x.uid === ev)) : '';
    const r = takeLoot(inv, item, ev);
    if (!r.ok) {
      msg = t(r.reason === 'full' ? 'loot.evict_none' : 'inv.stash_full');
      msgColor = '#ff8080';
      return false;
    }
    inv = setInventory(r.inv);
    c.ui.state[ei] = 'taken';
    if (r.evicted) {
      countDisassembled(1);
      msg = t('loot.evicted', { name: evName, n: r.crystals });
      msgColor = '#ffb060';
    } else {
      msg = '';
    }
    return true;
  };

  const disOne = (ei) => {
    const c = pages[idx];
    const r = disassembleLoot(inv, c.entries[ei].item);
    inv = setInventory(r.inv);
    c.ui.state[ei] = 'dis';
    return r.crystals;
  };

  const open = () => pages[idx].entries.map((e, ei) => ei).filter((ei) => !pages[idx].ui.state[ei]);

  const take = (ei) => { takeOne(ei); render(); };

  const dis = (ei) => {
    const n = disOne(ei);
    countDisassembled(1);
    msg = t('loot.disassembled', { n });
    msgColor = '#8cff6a';
    render();
  };

  const takeAll = () => {
    for (const ei of open()) if (!takeOne(ei)) break;
    render();
  };

  const disAll = () => {
    const list = open();
    let n = 0;
    for (const ei of list) n += disOne(ei);
    if (list.length) {
      countDisassembled(list.length);
      msg = t('loot.disassembled', { n });
      msgColor = '#8cff6a';
    }
    render();
  };

  const finish = () => {
    if (finished) return;
    finished = true;
    nav.clear();
    for (const o of objs) o.destroy();
    objs = [];
    inv = setInventory(getInventory(), { backup: true });
    const res = checkMetaAchievements();
    onDone([...unlocked, ...res.unlocked]);
  };

  function next() {
    if (!chestDone(pages[idx])) return;
    if (idx < pages.length - 1) {
      idx++;
      msg = '';
      render();
    } else {
      finish();
    }
  }

  // Карточка предмета: картинка, имя, редкость, аффиксы (или скилл уникалки), решение или две кнопки.
  function drawCard(c, e, ei, L) {
    const mid = L + CARD.w / 2;
    addPanel(scene, mid, CARD.y + CARD.h / 2, CARD.w, CARD.h);
    const st = c.ui.state[ei];
    if (e.kind === 'scroll') {
      scene.add.text(mid, CARD.y + 60, t('loot.scroll'), textStyle(12, '#9ad0ff')).setOrigin(0.5);
      scene.add.text(mid, CARD.y + 80, t('loot.auto'), textStyle(9, COLORS.dim)).setOrigin(0.5);
      return;
    }
    const it = e.item;
    const C = 12;
    const [w, h] = it.shape;
    drawItemBox(scene, mid - (w * C) / 2, CARD.y + 8, w * C, h * C, it);
    let y = CARD.y + 12 + h * C;
    const title = scene.add.text(mid, y, itemTitle(it), textStyle(11, RARITY_CSS[it.rarity],
        { wordWrap: { width: CARD.w - 12 }, align: 'center' })).setOrigin(0.5, 0);
    y += title.height + 2;
    const meta = [t(`item.rarity.${it.rarity}`), t('item.tier', { n: it.tier }),
      `${t(`item.kind.${it.type}`)} ${w}×${h}`];
    scene.add.text(mid, y, meta.join(' · '), textStyle(8, COLORS.dim)).setOrigin(0.5, 0);
    y += 12;
    if (it.unique) {
      scene.add.text(L + 6, y, t(`unique.${it.unique}.desc`), textStyle(8, '#ffd8a0',
          { wordWrap: { width: CARD.w - 12 } })).setOrigin(0, 0);
    } else {
      for (const l of affixLines(it)) {
        const a = affixText(l);
        scene.add.text(L + 6, y, a.text, textStyle(8, a.color)).setOrigin(0, 0);
        y += 11;
      }
    }
    const bw = CARD.w - 24;
    const takeY = CARD.y + CARD.h - 42;
    const disY = CARD.y + CARD.h - 17;
    if (st) {
      scene.add.text(mid, (takeY + disY) / 2, st === 'taken' ? t('loot.taken') :
        t('loot.disassembled', { n: disassembleValue(it) }),
      textStyle(11, st === 'taken' ? '#8cff6a' : '#9ad0ff')).setOrigin(0.5);
      return;
    }
    if (stashFull(inv.stash)) {
      const ev = evictFor(`${idx}:${ei}`);
      const evIt = ev && inv.stash.find((x) => x.uid === ev);
      scene.add.text(mid, takeY - 13, evIt ? t('loot.evict', { name: itemTitle(evIt) }) : t('loot.evict_none'),
          textStyle(8, '#ff9060', { wordWrap: { width: CARD.w - 10 }, align: 'center' })).setOrigin(0.5, 1);
    }
    addButton(scene, nav, { x: mid, y: takeY, w: bw, h: BUTTON.tab.h, size: 11, label: t('loot.take'),
      onSelect: () => take(ei) });
    addButton(scene, nav, { x: mid, y: disY, w: bw, h: BUTTON.tab.h, size: 11,
      label: t('loot.disassemble', { n: disassembleValue(it) }), onSelect: () => dis(ei) });
  }

  function render() {
    if (finished) return;
    const keep = nav.index;
    nav.clear();
    for (const o of objs) o.destroy();
    const before = new Set(scene.children.list);
    const cx = GAME_WIDTH / 2;
    scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.82).setOrigin(0, 0);
    overlayTitle(scene, t('loot.title'));
    const c = pages[idx];
    scene.add.text(cx, SUB_Y, t('loot.chest', { i: idx + 1, n: pages.length, boss: bossName(c.boss), tier: c.tier }),
        textStyle(10, '#dddddd')).setOrigin(0.5);
    if (c.hearts) { // сердца уже в кошельке (initChests)
      scene.add.text(cx, HEARTS_Y, t('loot.hearts', { n: c.hearts }), textStyle(9, '#ff7090')).setOrigin(0.5);
    }
    const n = c.entries.length;
    const x0 = cx - (n * CARD.w + (n - 1) * CARD.gap) / 2;
    c.entries.forEach((e, ei) => drawCard(c, e, ei, x0 + ei * (CARD.w + CARD.gap)));
    scene.add.text(cx, CARD.y + CARD.h + 6, msg, textStyle(9, msgColor)).setOrigin(0.5, 0);

    const left = open();
    const done = !left.length;
    const crystals = left.reduce((s, ei) => s + disassembleValue(c.entries[ei].item), 0);
    const xs = rowXs(3, cx, ROW_W);
    const by = GAME_HEIGHT - 22;
    const all = addButton(scene, nav, { x: xs[0], y: by, w: ROW_W, h: BUTTON.action.h, size: 11,
      label: t('loot.take_all'), onSelect: () => takeAll() });
    const disAllBtn = addButton(scene, nav, {
      x: xs[1], y: by, w: ROW_W, h: BUTTON.action.h, size: 11,
      label: t('loot.disassemble_all', { n: crystals }), onSelect: () => disAll() });
    const last = idx >= pages.length - 1;
    const go = addButton(scene, nav, { x: xs[2], y: by, w: ROW_W, h: BUTTON.action.h, size: 11,
      label: t(last ? 'loot.done' : 'loot.next'), onSelect: () => next() });
    all.setDisabled(done);
    disAllBtn.setDisabled(done);
    go.setDisabled(!done);
    objs = scene.children.list.filter((o) => !before.has(o) && o.type !== 'Zone');
    nav.silent = true; // перерисовка, а не шаг фокуса: без звука
    if (done) nav.focus(nav.items.indexOf(go));
    else nav.focus(Math.max(0, Math.min(keep, nav.items.length - 1)));
    nav.refocus();
    nav.silent = false;
  }

  render();
  return nav;
}
