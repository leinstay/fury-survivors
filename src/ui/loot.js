// Лут с боссов после забега (GameOver / Victory): по сундуку на экран, в каждом CHEST_SIZE записей.
// Предмет: «Взять» / «Пропустить». Свитки и сердца хаоса берутся сами при открытии экрана.
// Стеш полон: под «Взять» видно, что исчезнет (previewEvict); вытесненный предмет разбирается в кристаллы.
// Лут лежит в sim.players[i].loot (src/core/sim.js), сохраняется через services/inventory.js.
import { t } from '../i18n/index.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../data/constants.js';
import { BOSSES } from '../data/bosses.js';
import { FocusNav, addButton } from './focus.js';
import { BUTTON } from './menu-layout.js';
import { addPanel } from './panel.js';
import { textStyle, COLORS } from './style.js';
import { createRng } from '../core/rng.js';
import { previewEvict, stashFull, addCurrency, newUid, affixLines } from '../core/items.js';
import { takeLoot, hasUid } from '../core/inventory.js';
import { getInventory, setInventory } from '../services/inventory.js';
import { checkMetaAchievements } from '../services/achievements.js';
import { drawItemBox, itemTitle, affixText, RARITY_CSS } from './items.js';

const CARD = { w: 196, h: 226, y: 62, gap: 8 };

const bossName = (id) => (BOSSES[id] ? t(`boss.${id}.name`) : '?');

/** Есть ли у своего игрока неразобранный лут. */
export function hasPendingLoot(sim) {
  const me = sim && (sim.players[sim.local] || sim.player);
  return !!(me && me.loot && me.loot.length && !me.lootClaimed);
}

/**
 * Экран лута. onDone(unlocked) — когда игрок закончил (ids полученных ачивок за стеш).
 * Повторный вызов для того же забега сразу вызывает onDone (лут уже разобран).
 * @param {!Phaser.Scene} scene
 * @param {!Object} sim
 * @param {function(!Array<string>)} onDone
 * @return {!FocusNav} навигация экрана (update(time) из сцены)
 */
export function buildLoot(scene, sim, onDone) {
  const me = sim.players[sim.local] || sim.player;
  const loot = (me && me.loot) || [];
  if (!loot.length || me.lootClaimed) {
    onDone([]);
    return { items: [], update() {} };
  }
  me.lootClaimed = true;
  const rng = createRng((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0);
  // свитки и сердца — сразу в кошелёк
  let hearts = 0;
  let scrolls = 0;
  for (const c of loot) {
    hearts += c.hearts || 0;
    for (const e of c.entries) if (e.kind === 'scroll') scrolls++;
  }
  let inv = getInventory();
  if (hearts || scrolls) {
    inv = setInventory({ ...inv, wallet: addCurrency(inv.wallet, { hearts, scrolls }) });
  }

  const state = loot.map((c) => c.entries.map((e) => (e.kind === 'scroll' ? 'auto' : null)));
  const evict = {};
  let idx = 0;
  let msg = '';
  let msgColor = '#dddddd';
  let objs = [];
  const nav = new FocusNav(scene, { onBack: () => next() });

  const evictFor = (key) => {
    if (!stashFull(inv.stash)) return null;
    const cur = evict[key];
    if (cur && inv.stash.some((x) => x.uid === cur && !x.locked)) return cur;
    evict[key] = previewEvict(inv.stash, rng);
    return evict[key];
  };

  const take = (ci, ei) => {
    const e = loot[ci].entries[ei];
    let item = e.item;
    if (hasUid(inv, item.uid)) item = { ...item, uid: newUid(rng) }; // тот же seed уже давал этот предмет
    const key = `${ci}:${ei}`;
    const ev = evictFor(key);
    const evName = ev ? itemTitle(inv.stash.find((x) => x.uid === ev)) : '';
    const r = takeLoot(inv, item, ev);
    if (!r.ok) {
      msg = t(r.reason === 'full' ? 'loot.evict_none' : 'inv.stash_full');
      msgColor = '#ff8080';
      render();
      return;
    }
    inv = setInventory(r.inv);
    state[ci][ei] = 'taken';
    msg = r.evicted ? t('loot.evicted', { name: evName, n: r.crystals }) : '';
    msgColor = '#ffb060';
    render();
  };

  const skip = (ci, ei) => {
    state[ci][ei] = 'skipped';
    msg = '';
    render();
  };

  const finish = () => {
    nav.clear();
    for (const o of objs) o.destroy();
    objs = [];
    inv = setInventory(getInventory(), { backup: true });
    const res = checkMetaAchievements();
    onDone(res.unlocked);
  };

  function next() {
    if (idx < loot.length - 1) {
      idx++;
      msg = '';
      render();
    } else {
      finish();
    }
  }

  function render() {
    const keep = nav.index;
    nav.clear();
    for (const o of objs) o.destroy();
    const before = new Set(scene.children.list);
    const cx = GAME_WIDTH / 2;
    scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.82).setOrigin(0, 0);
    scene.add.text(cx, 18, t('loot.title'), textStyle(20, '#ffd84a', { stroke: '#000000', strokeThickness: 4 }))
        .setOrigin(0.5);
    const c = loot[idx];
    scene.add.text(cx, 38, t('loot.chest', { i: idx + 1, n: loot.length, boss: bossName(c.boss), tier: c.tier }),
        textStyle(10, '#dddddd')).setOrigin(0.5);
    if (hearts) {
      scene.add.text(cx, 50, t('loot.hearts', { n: hearts }), textStyle(9, '#ff7090')).setOrigin(0.5);
    }
    const n = c.entries.length;
    const x0 = cx - (n * CARD.w + (n - 1) * CARD.gap) / 2;
    c.entries.forEach((e, ei) => {
      const L = x0 + ei * (CARD.w + CARD.gap);
      const mid = L + CARD.w / 2;
      addPanel(scene, mid, CARD.y + CARD.h / 2, CARD.w, CARD.h);
      const st = state[idx][ei];
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
      const by = CARD.y + CARD.h - 34;
      if (st) {
        scene.add.text(mid, by, t(st === 'taken' ? 'loot.taken' : 'loot.skipped'),
            textStyle(11, st === 'taken' ? '#8cff6a' : COLORS.dim)).setOrigin(0.5);
        return;
      }
      addButton(scene, nav, { x: mid - 46, y: by, w: 86, h: BUTTON.tab.h, size: 11, label: t('loot.take'),
        onSelect: () => take(idx, ei) });
      addButton(scene, nav, { x: mid + 46, y: by, w: 86, h: BUTTON.tab.h, size: 11, label: t('loot.skip'),
        onSelect: () => skip(idx, ei) });
      if (stashFull(inv.stash)) {
        const ev = evictFor(`${idx}:${ei}`);
        const evIt = ev && inv.stash.find((x) => x.uid === ev);
        scene.add.text(mid, by + 13, evIt ? t('loot.evict', { name: itemTitle(evIt) }) : t('loot.evict_none'),
            textStyle(8, '#ff9060', { wordWrap: { width: CARD.w - 10 }, align: 'center' })).setOrigin(0.5, 0);
      }
    });
    scene.add.text(cx, CARD.y + CARD.h + 8, msg, textStyle(9, msgColor)).setOrigin(0.5, 0);
    const last = idx >= loot.length - 1;
    addButton(scene, nav, { x: cx, y: GAME_HEIGHT - 22, ...BUTTON.action, size: 12,
      label: t(last ? 'loot.done' : 'loot.next'), onSelect: () => next() });
    objs = scene.children.list.filter((o) => !before.has(o) && o.type !== 'Zone');
    nav.focus(Math.max(0, Math.min(keep, nav.items.length - 1)));
  }

  render();
  return nav;
}
