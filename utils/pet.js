/**
 * 萌宠大厨养成：喵条账本 + 等级计算
 *
 * 设计口径（2026-10-19 拍板）：
 * - 每记一顿「自己做」+10 喵条；同一天同一道菜只计一次；每日上限 +30
 * - 「出去吃」不计；删除记录不回退（账本只增不减，防「加→删→加」刷分）
 * - 独立存储 eatwhat_pet_v1，不通过 records 实时计算——
 *   否则删记录会掉喵条甚至掉级，且同日同菜去重会被「记→删→再记」绕过
 * - 跳跃动画只在等级真变高时播一次：jumpPending 置位，喵屋页消费后落 lastJumpLevel
 */
const PET_KEY = 'eatwhat_pet_v1';

/** 每顿固定收益与每日上限 */
const GAIN_PER_MEAL = 10;
const DAILY_CAP = 30;

/**
 * 等级表：need = 达到该级所需累计喵条。
 * 数值调整只改这里（改阈值需重新发版审核，首次放宽、别频繁微调）。
 * 按「每天 +30」约需：2 / 6 / 13 / 27 / 50 / 100 天满级。
 */
const LEVELS = [
  { lv: 1, title: '新手铲屎官', need: 0 },
  { lv: 2, title: '打蛋学徒',   need: 60 },
  { lv: 3, title: '掌勺小厨',   need: 180 },
  { lv: 4, title: '家常大厨',   need: 400 },
  { lv: 5, title: '一桌好菜',   need: 800 },
  { lv: 6, title: '喵屋主厨',   need: 1500 },
  { lv: 7, title: '传说厨神',   need: 3000 }
];

/** 等级立绘（A3 定稿，art/scripts/make-pet.py 入包；改图只换内容不改名） */
function levelImage(lv) {
  return '/assets/images/pet/lv' + lv + '.png';
}

function todayKey() {
  const d = new Date();
  const p = function (n) { return n < 10 ? '0' + n : '' + n; };
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function read() {
  try {
    const v = wx.getStorageSync(PET_KEY);
    if (v && typeof v === 'object' && typeof v.exp === 'number') return v;
  } catch (e) { /* ignore */ }
  return blank();
}

function blank() {
  return {
    exp: 0,               // 累计喵条（只增不减）
    totalMeals: 0,        // 累计下厨顿数（含达到日上限后记入的）
    daily: { date: '', gain: 0, keys: [] },  // 当日收益与已计菜（删记录不清 key）
    lastJumpLevel: 0,     // 已在喵屋播过跳跃动画的最高等级
    jumpPending: false    // 有新等级待播动画
  };
}

function write(state) {
  try { wx.setStorageSync(PET_KEY, state); } catch (e) { /* ignore */ }
}

/** 跨天滚动：新的一天重置当日收益与去重 key */
function normalize(state) {
  const today = todayKey();
  if (!state.daily || state.daily.date !== today) {
    state.daily = { date: today, gain: 0, keys: [] };
  }
  if (!Array.isArray(state.daily.keys)) state.daily.keys = [];
  if (typeof state.totalMeals !== 'number') state.totalMeals = 0;
  if (typeof state.lastJumpLevel !== 'number') state.lastJumpLevel = 0;
  return state;
}

/** 累计喵条 → 等级下标（0 起） */
function levelIndex(exp) {
  let idx = 0;
  for (let i = 0; i < LEVELS.length; i++) {
    if (exp >= LEVELS[i].need) idx = i;
  }
  return idx;
}

/**
 * 记一顿饭（由 store.addRecord 统一调用，别在页面里直接调）。
 * dish.type === 'nearby'（出去吃）不计。
 * 返回 { gained, levelUp, fromLv, toLv, reason }
 *   reason: '' | 'dup'(同日同菜已计) | 'cap'(今日已达上限) | 'nearby'
 */
function addForDish(dish) {
  const state = normalize(read());
  const out = { gained: 0, levelUp: false, fromLv: 0, toLv: 0, reason: '' };

  if (!dish || dish.type === 'nearby') { out.reason = 'nearby'; return out; }

  /* 顿数与喵条分离：重复记 / 超上限都算「下了一顿」，只是不再涨条 */
  state.totalMeals += 1;

  const key = todayKey() + '|' + (dish.name || '');
  if (state.daily.keys.indexOf(key) > -1) { out.reason = 'dup'; write(state); return out; }

  if (state.daily.gain >= DAILY_CAP) { out.reason = 'cap'; write(state); return out; }

  const gain = Math.min(GAIN_PER_MEAL, DAILY_CAP - state.daily.gain);
  const before = levelIndex(state.exp);
  state.exp += gain;
  state.daily.gain += gain;
  if (state.daily.keys.indexOf(key) < 0) state.daily.keys.push(key);
  const after = levelIndex(state.exp);

  out.gained = gain;
  if (after > before) {
    out.levelUp = true;
    out.fromLv = LEVELS[before].lv;
    out.toLv = LEVELS[after].lv;
    state.jumpPending = true;   // 喵屋页消费后置 lastJumpLevel
  }
  write(state);
  return out;
}

/** 删除记录：喵条不回退，这里只读不改（留空以满足语义） */
function onRecordRemoved() { /* 只增不减口径：不做任何扣减 */ }

/**
 * 【测试专用】直接加喵条，用于验证各等级立绘 / 跳跃动画。
 * 与真实收益完全隔离：不写 daily.gain、不动 daily.keys、不加 totalMeals，
 * 因此既不受「每日上限 30」「同日同菜去重」约束，也不会污染真实统计口径。
 * 入口：「我的」页左下角测试按钮（release 版不渲染）。
 * 返回 { gained, levelUp, fromLv, toLv }
 */
function addTestExp(amount) {
  const state = normalize(read());
  const n = Math.max(0, Math.floor(Number(amount) || 0));
  const out = { gained: 0, levelUp: false, fromLv: 0, toLv: 0 };
  if (!n) return out;

  const before = levelIndex(state.exp);
  state.exp += n;
  const after = levelIndex(state.exp);

  out.gained = n;
  if (after > before) {
    out.levelUp = true;
    out.fromLv = LEVELS[before].lv;
    out.toLv = LEVELS[after].lv;
    state.jumpPending = true;   /* 与真实升级同口径：进喵屋补播一次跳跃 */
  }
  write(state);
  return out;
}

/**
 * 顶部展示摘要（我的页 / 首页气泡 / 喵屋共用）
 * progress：当前级内进度百分比；remain：距下一级还差多少
 */
function summary() {
  const state = normalize(read());
  const idx = levelIndex(state.exp);
  const cur = LEVELS[idx];
  const next = LEVELS[idx + 1] || null;
  const base = cur.need;
  const span = next ? (next.need - base) : 1;
  const progress = next ? Math.min(100, Math.round(((state.exp - base) / span) * 100)) : 100;
  return {
    exp: state.exp,
    totalMeals: state.totalMeals,
    todayGain: state.daily.gain,
    dailyCap: DAILY_CAP,
    gainPerMeal: GAIN_PER_MEAL,
    lv: cur.lv,
    title: cur.title,
    image: levelImage(cur.lv),
    nextTitle: next ? next.title : '',
    nextNeed: next ? next.need : 0,
    remain: next ? Math.max(0, next.need - state.exp) : 0,
    progress: progress,
    maxed: !next
  };
}

/** 喵屋页取跳跃任务（消费式：读出即标记已播，防重复播放） */
function takeJumpTask() {
  const state = normalize(read());
  const idx = levelIndex(state.exp);
  const curLv = LEVELS[idx].lv;
  if (state.jumpPending && curLv > state.lastJumpLevel) {
    state.jumpPending = false;
    state.lastJumpLevel = curLv;
    write(state);
    return { fromLv: curLv - 1, toLv: curLv };
  }
  return null;
}

/** 是否有待播的升级动画（不消费；「我的」页用它挂「升到 Lv.x · 去看看」轻提示） */
function hasPendingJump() {
  const state = normalize(read());
  const curLv = LEVELS[levelIndex(state.exp)].lv;
  return state.jumpPending && curLv > state.lastJumpLevel;
}

module.exports = {
  LEVELS: LEVELS,
  GAIN_PER_MEAL: GAIN_PER_MEAL,
  DAILY_CAP: DAILY_CAP,
  levelImage: levelImage,
  addForDish: addForDish,
  onRecordRemoved: onRecordRemoved,
  addTestExp: addTestExp,
  summary: summary,
  takeJumpTask: takeJumpTask,
  hasPendingJump: hasPendingJump,
  levelIndex: levelIndex,

  /** 清空账本（store.resetAll 用：回到新用户 = 等级也归零） */
  reset() {
    write(blank());
  }
};
