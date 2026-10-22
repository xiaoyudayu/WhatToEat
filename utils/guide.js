/**
 * 新手引导：全局状态 + 几何换算
 *
 * 引导共 7 步，跨 4 个页面：
 *   1 首页·奖池呼吸 + 开始按钮 + 上手势
 *   2 首页·结果态 + 记录按钮 + 上挑手势
 *   3 我的·今日饮食整块高亮 + 区域内滑动手势 + 气泡（ok👌）
 *   4 添加页·菜名弹窗高亮 + 朝上手势
 *   5 添加页·标签+食材高亮（toast 2s 后自动进入第 6 步）
 *   6 添加页·去试试吧高亮 + 上手势
 *   7 菜单页·菜品行高亮 + toast 2s 后出现【继续添加】气泡
 *
 * 步骤状态放在内存里（页面间跳转不丢），「是否已看过」落 storage。
 */
const SEEN_KEY = 'eatwhat_guide_seen_v1';

const STEP = {
  NONE: 0,
  HOME_POOL: 1,
  HOME_RESULT: 2,
  PROFILE_DIET: 3,
  ADD_MODAL: 4,
  ADD_TAGS: 5,
  ADD_TRY: 6,
  MENU_ROW: 7
};

let step = STEP.NONE;
let seen = false;
/* 本次启动是否已经开始过引导（内存态）。
   主流程收尾回首页时会带着 transition，若只看 hasSeen() 会被误判成新用户、把第一步重播一遍。 */
let started = false;

function init() {
  try {
    seen = !!wx.getStorageSync(SEEN_KEY);
  } catch (e) {
    seen = false;
  }
}

function getStep() {
  return step;
}

function setStep(n) {
  step = n;
}

function isActive() {
  return step > 0;
}

function hasSeen() {
  return seen;
}

/** 引导第一次真正亮起时调用（本次启动只自动触发一次） */
function markStarted() {
  started = true;
}

function hasStarted() {
  return started;
}

/** 引导走完 / 被跳过：落库，不再自动触发 */
function markSeen() {
  seen = true;
  try {
    wx.setStorageSync(SEEN_KEY, 1);
  } catch (e) {
    /* ignore */
  }
}

/** 重新看一遍（设置页 / 调试用） */
function reset() {
  seen = false;
  started = false;
  step = STEP.NONE;
  try {
    wx.removeStorageSync(SEEN_KEY);
  } catch (e) {
    /* ignore */
  }
}

/**
 * 「添加功能」引导的待触发标记：主流程（1~3 步）走完或被跳过后置位。
 * 等用户第一次自己点开添加页（tab ＋ / 菜单空态 ＋ / 任意新建入口）才亮起第四步，
 * 不再「停几秒自动跳转」。内存态，与步骤状态同生命周期（下次启动引导从头开始）。
 */
let pendingAdd = false;
function setPendingAdd(v) {
  pendingAdd = !!v;
}
function takePendingAdd() {
  const v = pendingAdd;
  pendingAdd = false;
  return v;
}

/** 最近一次通过【去试试吧】保存的菜名（菜单页引导用它定位要高亮的行） */
let lastDish = '';
function setLastDish(name) {
  lastDish = name || '';
}
function getLastDish() {
  return lastDish;
}

/* ---------------- 引导层视图状态 ---------------- */

/** 引导层的空白视图状态（各页面在 data.g 里使用同一份结构） */
function baseState() {
  return {
    step: 0,
    maskSoft: false,
    halo: false, haloStyle: '',
    block: false, blockStyle: '',
    ring: false, ringStyle: '', ringBlock: false,
    rip: false, ripStyle: '',
    hand: '', handStyle: '', handTravel: '', handRange: '',
    arrow: false, arrowStyle: '', arrowShaft: 0,
    hint: '', hintBtn: '', hintBig: false, hintStyle: '',
    toast: '', toastGone: false, toastStyle: '',
    skip: false, skipTop: 0,
    poolGlow: false, liftPool: false,
    glowDraw: false, liftDraw: false,
    glowRec: false, liftRec: false,
    glowFab: false, liftFab: false,
    liftTab: '',   /* '' | 'menu' | 'add' | 'mine' —— 当前需要抬到蒙层之上的 tab */
    liftTagZone: false, liftDishRow: false, liftDietCard: false
  };
}

/* ---------------- 几何换算 ---------------- */

/** 原型 375pt 宽 → 当前机型 px 的缩放系数 */
function scale() {
  const app = getApp();
  const w = (app && app.globalData && app.globalData.windowWidth) || 375;
  return w / 375;
}

/** 原型 px → 当前机型 px */
function px(v) {
  return v * scale();
}

/**
 * 手势指尖相对「手势盒子左上角」的偏移（px）。
 * 手势盒子 = 40pt × 46pt（80rpx × 92rpx），指尖在盒子内为 (19.1, 2.4)。
 * rotated=true 对应 rotate(155deg)，旋转原点 50% 100%，
 * 指尖会跑到盒子 (39.24, 85.13) 的位置。
 */
function tipOffset(rotated) {
  const k = scale();
  return rotated
    ? { dx: 39.24 * k, dy: 85.13 * k }
    : { dx: 19.1 * k, dy: 2.4 * k };
}

/** 量取单个节点（返回 Promise<rect|null>，单位 px） */
function measure(selector) {  return new Promise(function (resolve) {
    wx.createSelectorQuery()
      .select(selector)
      .boundingClientRect(function (rect) {
        resolve(rect || null);
      })
      .exec();
  });
}

/** 量取多个节点，按传入顺序返回数组 */
function measureAll(selectors) {
  return new Promise(function (resolve) {
    const q = wx.createSelectorQuery();
    selectors.forEach(function (sel) {
      q.select(sel).boundingClientRect();
    });
    q.exec(function (res) {
      resolve(res || []);
    });
  });
}

/** 系统信息（状态栏高度、胶囊位置） */
function device() {
  const app = getApp();
  const g = (app && app.globalData) || {};
  let capsule = null;
  try {
    capsule = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
  } catch (e) {
    capsule = null;
  }
  return {
    statusBarHeight: g.statusBarHeight || 44,
    windowWidth: g.windowWidth || 375,
    windowHeight: g.windowHeight || 812,
    capsule: capsule
  };
}

module.exports = {
  STEP: STEP,
  init: init,
  baseState: baseState,
  getStep: getStep,
  setStep: setStep,
  isActive: isActive,
  hasSeen: hasSeen,
  hasStarted: hasStarted,
  markStarted: markStarted,
  markSeen: markSeen,
  reset: reset,
  setPendingAdd: setPendingAdd,
  takePendingAdd: takePendingAdd,
  setLastDish: setLastDish,
  getLastDish: getLastDish,
  scale: scale,
  px: px,
  tipOffset: tipOffset,
  measure: measure,
  measureAll: measureAll,
  device: device
};
