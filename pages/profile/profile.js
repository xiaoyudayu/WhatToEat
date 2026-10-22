const store = require('../../utils/store');
const guide = require('../../utils/guide');
const tips = require('../../utils/tips');
const pet = require('../../utils/pet');

const WEEK = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

const STEP = guide.STEP;

Page({
  data: {
    statusBarHeight: 44,
    today: { date: '', week: '', clock: '' },
    weather: tips.heroInfo(new Date(), 'supper'),   /* 头部信息块（时段 + 月份季节），非天气数值 */
    /* hero：时段换装 + 喵语贴士 */
    catImg: '/assets/images/ip/cat-meal-supper.png',
    heroGlow: tips.BUCKET_META.supper.glow,
    tipTag: tips.BUCKET_META.supper.tag,
    tipText: '',
    tipHidden: false,
    /* 时段首访小看板 */
    boardVisible: false,
    boardAnim: '',
    boardText: '',
    boardLeftPx: null,
    boardTopPx: null,
    hintOpacity: 1,
    slots: [],
    stats: [],
    totalCount: 0,
    curSlot: 0,
    dietScrollTop: 0,
    pet: null,                 // 喵条摘要（hero 左列卡，null = 引导期隐藏）
    levelUpTip: null,          // 升级轻提示（不自动跳页，点击才进喵屋播跳跃）
    showTest: false,           // 左下角喵条测试按钮（仅开发/体验版显示）
    g: guide.baseState()
  },

  onLoad() {
    this.setData({
      statusBarHeight: guide.device().statusBarHeight,
      showTest: this.isDevEnv()
    });
  },

  /** 正式版（release）不渲染测试按钮：只有开发者工具 / 体验版才需要造数据 */
  isDevEnv() {
    try {
      const info = wx.getAccountInfoSync && wx.getAccountInfoSync();
      const env = info && info.miniProgram && info.miniProgram.envVersion;
      return env !== 'release';
    } catch (e) {
      return true;
    }
  },

  onShow() {
    this.refresh();
    if (guide.getStep() === STEP.PROFILE_DIET) {
      this.applyGuideView();
    }
    this.timer = setInterval(() => this.refreshTime(), 15000);
  },

  onHide() {
    if (this.timer) clearInterval(this.timer);
    if (this.stepTimer) { clearTimeout(this.stepTimer); this.stepTimer = null; }
    /* 离开「我的」页：看板收起并记为已读（与原型 switchTab 行为一致） */
    if (this.data.boardVisible) this.collapseTipBoard(true);
  },

  onUnload() {
    if (this.timer) clearInterval(this.timer);
    if (this.stepTimer) { clearTimeout(this.stepTimer); this.stepTimer = null; }
    if (this.hintTimer) { clearTimeout(this.hintTimer); this.hintTimer = null; }
    if (this.boardTimer) { clearTimeout(this.boardTimer); this.boardTimer = null; }
  },

  /* ================= 数据 ================= */

  refresh() {
    const now = new Date();
    const h = now.getHours();
    const cur = store.defaultSlot();
    const curSlot = store.SLOTS.indexOf(cur);

    const bySlot = store.getRecordsBySlot();
    /* 旧记录可能没存图（早期「记入饮食」只传了菜名）：按 dishId / 菜名回查菜品补图 */
    const allDishes = store.getDishes();
    const slots = store.SLOTS.map(function (name, index) {
      const items = (bySlot[name] || []).map(function (r) {
        const dish = (r.dishId && store.getDish(r.dishId)) ||
          allDishes.filter(function (d) { return d.name === r.name; })[0];
        return { rid: r.rid, name: r.name, image: (dish && dish.image) || r.image || store.PLACEHOLDER };
      });
      /* 空态文案 + 是否给「＋」按钮（只有「当前时段且可行动」才给，与原型 5.2 一致） */
      let empty;
      let plus = false;
      if (index === curSlot) {
        if (h < 10) { empty = '去随机一个吧'; plus = true; }
        else if (h >= 15) { empty = '去首页随机一个'; plus = true; }
        else { empty = '记得按时吃饭哦'; }
      } else if (index < curSlot) {
        empty = '记得按时吃饭哦';          /* 已过时段：纯文案 */
      } else {
        empty = '还没到饭点哦～';          /* 尚未到的时段：纯文案 */
      }
      return { name: name, items: items, count: items.length, empty: empty, plus: plus };
    });

    /* 时段换装 + 喵语贴士 + 氛围光晕 */
    const bucket = tips.timeBucket(h);
    const meta = tips.BUCKET_META[bucket];
    /* 信息块 + 贴士：不再依赖任何天气数据源（也不会出现「不是雨天却说雨天」） */
    const w = tips.heroInfo(now, bucket);
    const tipText = tips.pickTip(now, bucket);

    this.setData({
      today: {
        date: (now.getMonth() + 1) + '月' + now.getDate() + '日',
        week: WEEK[now.getDay()],
        clock: ('0' + h).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2)
      },
      weather: w,
      catImg: '/assets/images/ip/cat-meal-' + bucket + '.png',
      heroGlow: meta.glow,
      tipTag: meta.tag,
      tipText: tipText,
      slots: slots,
      totalCount: slots.reduce(function (s, x) { return s + x.count; }, 0),
      stats: store.getTodayStats(),
      /* 引导第三步进行中隐藏喵条卡：别抢 diet-card 高亮的视觉焦点 */
      pet: guide.getStep() === STEP.PROFILE_DIET ? null : pet.summary(),
      /* 有新等级未播跳跃 → 挂「去看看」轻提示（点了才进喵屋，不自动切页） */
      levelUpTip: pet.hasPendingJump()
        ? { lv: pet.summary().lv, title: pet.summary().title }
        : null,
      curSlot: this.data.curSlot || curSlot
    }, () => {
      /* 每个时段首次进「我的」：先看板后贴士 */
      this.maybeShowTipBoard(bucket, tipText);
    });
  },

  refreshTime() {
    const now = new Date();
    this.setData({
      'today.clock': ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2)
    });
  },

  /* ================= 时段首访小看板 ================= */

  maybeShowTipBoard(bucket, tipText) {
    let seen = false;
    try { seen = !!wx.getStorageSync(tips.tipBoardKey(bucket)); } catch (e) { }
    if (seen) {
      /* 该时段已看过：直接显示贴士气泡 */
      this.setData({ boardVisible: false, tipHidden: false });
      return;
    }
    /* 先量好位置再弹出，避免闪跳 */
    this.placeTipBoard(() => {
      this.setData({
        boardVisible: true,
        boardAnim: 'is-in',
        boardText: tipText,
        tipHidden: true,
        hintOpacity: 1
      }, () => {
        /* 动作引导：展示 3s 后淡出 */
        if (this.hintTimer) clearTimeout(this.hintTimer);
        this.hintTimer = setTimeout(() => {
          this.hintTimer = null;
          this.setData({ hintOpacity: 0 });
        }, 3000);
      });
    });
  },

  /** 看板定位：夹子中心对猫中心（left）；看板上边界 = 萌宠图片下边界，间距 0（top） */
  placeTipBoard(cb) {
    const q = wx.createSelectorQuery().in(this);
    q.select('#hero-cat').boundingClientRect();
    q.select('.page-root').boundingClientRect();
    q.exec((res) => {
      const cat = res && res[0];
      const root = res && res[1];
      if (!cat || !root || !cat.width) { if (cb) cb(); return; }
      this.setData({
        boardLeftPx: Math.round(cat.left - root.left + cat.width / 2),
        boardTopPx: Math.round(cat.bottom - root.top)
      }, () => { if (cb) cb(); });
    });
  },

  /** 收起看板：缩小渐隐动画 + 贴士恢复；silent = 页面切走时的静默收起 */
  collapseTipBoard(silent) {
    const bucket = tips.timeBucket(new Date().getHours());
    try { wx.setStorageSync(tips.tipBoardKey(bucket), '1'); } catch (e) { }
    if (this.hintTimer) { clearTimeout(this.hintTimer); this.hintTimer = null; }
    this.setData({ boardAnim: 'is-out', tipHidden: false });
    if (this.boardTimer) clearTimeout(this.boardTimer);
    this.boardTimer = setTimeout(() => {
      this.boardTimer = null;
      this.setData({ boardVisible: false, boardAnim: '' });
    }, 420);
    if (silent) this.setData({ boardVisible: false, boardAnim: '' });
  },

  onBoardPawTap() {
    this.collapseTipBoard();
  },

  /** 点击看板以外的区域也收起（看板自身 catchtap 已阻止冒泡） */
  onPageTap() {
    if (this.data.boardVisible) this.collapseTipBoard();
  },

  noop() {},

  onSlotTap(e) {
    this.setData({ curSlot: Number(e.currentTarget.dataset.index) });
  },

  onRemoveRecord(e) {
    const rid = e.currentTarget.dataset.rid;
    const name = e.currentTarget.dataset.name;
    const that = this;
    wx.showModal({
      title: '移除「' + name + '」？',
      content: '移除后这条记录会从今日饮食中消失',
      confirmText: '移除',
      confirmColor: '#E2622F',
      success(res) {
        if (res.confirm) {
          store.removeRecord(rid);
          that.refresh();
        }
      }
    });
  },

  onDrawAgain() {
    wx.reLaunch({ url: '/pages/home/home' });
  },

  /** 喵条卡 / 升级提示 → 喵屋（猫架等级页） */
  goPet() {
    this.setData({ levelUpTip: null });
    wx.navigateTo({ url: '/pages/pet/pet' });
  },

  /**
   * 【测试】左下角「喵条 +」：快速造等级数据，验证 7 级立绘 / 跳跃动画。
   * 走 pet.addTestExp —— 不写当日收益、不加顿数，故不受每日上限与同菜去重限制。
   */
  onTestPet() {
    const s = pet.summary();
    wx.showActionSheet({
      itemList: ['加 100 喵条', '直接升到下一级', '加 500 喵条', '加 10 喵条', '喵条归零（保留菜品）'],
      success: (res) => {
        const i = res.tapIndex;

        if (i === 4) {
          pet.reset();
          this.refresh();
          wx.showToast({ title: '喵条已归零', icon: 'none' });
          return;
        }

        let delta = 0;
        if (i === 0) delta = 100;
        else if (i === 1) delta = s.maxed ? 0 : Math.max(0, s.nextNeed - s.exp);
        else if (i === 2) delta = 500;
        else delta = 10;

        if (!delta) {
          wx.showToast({ title: '已是 Lv.7 传说厨神', icon: 'none' });
          return;
        }

        const r = pet.addTestExp(delta);
        this.refresh();
        wx.showToast({
          title: '喵条 +' + delta + (r.levelUp ? ' · 升到 Lv.' + r.toLv : ''),
          icon: 'none'
        });
      }
    });
  },

  /** 长按标题：清空本地数据（回到新用户状态）+ 允许重看引导（演示 / 调试用） */
  onResetDemo() {
    wx.showModal({
      title: '清空本地数据？',
      content: '会清空本地菜品与今日饮食记录（回到新用户状态），并让新手引导重新播放',
      confirmText: '重置',
      confirmColor: '#E2622F',
      success(res) {
        if (!res.confirm) return;
        store.resetAll();
        guide.reset();
        wx.reLaunch({ url: '/pages/home/home' });
      }
    });
  },

  /* ================= 引导（第三步） ================= */

  applyGuideView() {
    const g = guide.baseState();
    g.step = STEP.PROFILE_DIET;
    g.maskSoft = true;
    g.block = true;
    g.ring = true;
    g.ringBlock = true;
    g.hand = 'swipe';
    g.arrow = true;
    g.hint = '记入你的饮食手札～';
    g.hintBtn = 'ok👌';
    g.liftDietCard = true;
    g.liftTab = 'mine';

    this.setData({ g: g, curSlot: store.SLOTS.indexOf(store.defaultSlot()) }, () => {
      this.layoutGuide();
    });
  },

  layoutGuide() {
    const px = guide.px;
    guide.measureAll(['#diet-card', '#diet-body']).then((res) => {
      const card = res[0];
      const body = res[1];
      if (!card || !body || guide.getStep() !== STEP.PROFILE_DIET) return;

      const off = guide.tipOffset(false);
      const handTipX = body.left + body.width / 2 - px(44);
      const handTop = body.top + px(10) - off.dy;
      const handBottom = handTop + px(46);                     /* 手势盒高 46pt */
      const arrowTop = handBottom + px(8);
      const arrowH = Math.max(px(66), body.top + body.height - px(12) - arrowTop);

      this.setData({
        'g.blockStyle': 'left:' + card.left + 'px;top:' + card.top + 'px;width:' + card.width +
          'px;height:' + card.height + 'px;border-radius:' + px(24) + 'px;',
        'g.ringStyle': 'left:' + (card.left - px(5)) + 'px;top:' + (card.top - px(5)) +
          'px;width:' + (card.width + px(10)) + 'px;height:' + (card.height + px(10)) +
          'px;border-radius:' + px(25) + 'px;',
        'g.handStyle': 'left:' + (handTipX - off.dx) + 'px;top:' + handTop + 'px;',
        'g.arrowStyle': 'left:' + (body.left + body.width / 2 - px(11)) + 'px;top:' + arrowTop +
          'px;height:' + arrowH + 'px;',
        'g.hintStyle': 'top:' + (card.top + card.height + px(16)) + 'px;'
      });
    });
  },

  onGuideHintTap() {
    if (guide.getStep() === STEP.PROFILE_DIET) this.endMainGuide();
  },

  onGuideHintBtn() {
    if (guide.getStep() === STEP.PROFILE_DIET) this.endMainGuide();
  },

  onGuideMaskTap() {
    if (guide.getStep() === STEP.PROFILE_DIET) this.endMainGuide();
  },

  onGuideSkip() {},

  /** 第三步收尾：引导移交「添加」环节 —— 等用户第一次自己点开添加页再亮起，
      不再回首页停 2 秒自动跳转 */
  endMainGuide() {
    guide.setStep(0);
    guide.setPendingAdd(true);
    this.setData({ 'g.step': 0 });
    wx.reLaunch({ url: '/pages/home/home' });
  },

  /** 好友分享卡片（T1 · 四 tab 统一） */
  onShareAppMessage() {
    return {
      title: '今天吃什么？让猫咪帮你决定～',
      path: '/pages/home/home',
      imageUrl: '/assets/images/ip/share-card.jpg'
    };
  }
});
