const store = require('../../utils/store');
const guide = require('../../utils/guide');
const prep = require('../../utils/prep');
const poster = require('../../utils/poster');

const STEP = guide.STEP;

Page({
  data: {
    statusBarHeight: 44,
    tab: 'mine',
    cat: '全部',
    keyword: '',
    categories: [],
    list: [],
    selectedIds: [],
    selectedNear: '',
    barText: '点击 ＋ 添加你想吃的菜吧～',
    barCount: 0,
    isEmpty: false,        /* 当前 tab 全量为空 → 空状态（＋ + 添加菜品） */
    emptyH: 0,             /* 空态块 min-height：头部以下可视区高度 */
    highlightName: '',
    /* 备菜清单弹框（T1）：view = dish | serial | cross；
       stepView = 上滑恢复的步骤模式（记住手动选择）；into = scroll-into-view 锚点 */
    prep: { on: false, view: 'dish', stepView: 'serial', into: '', count: 0,
      totalMinutes: 0, stepCount: 0, ingredients: [], serial: [], cross: [] },
    /* 分享长图预览浮层 */
    poster: { on: false, path: '', saving: false },
    g: guide.baseState()
  },

  onLoad(options) {
    const tab = options && options.tab === 'nearby' ? 'nearby' : 'mine';
    this.setData({ statusBarHeight: guide.device().statusBarHeight, tab: tab });
  },

  onShow() {
    this.refresh();
    if (guide.getStep() === STEP.MENU_ROW) {
      this.applyGuideView();
    }
  },

  onHide() {
    this.clearTimers();
  },

  onUnload() {
    this.clearTimers();
  },

  clearTimers() {
    if (this.toastTimer) { clearTimeout(this.toastTimer); this.toastTimer = null; }
    if (this.stepTimer) { clearTimeout(this.stepTimer); this.stepTimer = null; }
  },

  /* ================= 列表 ================= */

  refresh() {
    const tab = this.data.tab;

    /* 该 tab 全量为空（新用户首进 / 全部删光）→ 空状态：＋ + 「添加菜品」 */
    if (!store.getDishes(tab).length) {
      this.setData({ isEmpty: true, list: [], categories: [], barText: '', barCount: 0 },
        () => this.layoutEmpty());
      return;
    }

    let list = store.getList(tab, this.data.cat);
    const kw = (this.data.keyword || '').trim();
    if (kw) {
      list = list.filter(function (d) {
        if ((d.name || '').indexOf(kw) > -1) return true;
        return (d.tags || []).some(function (t) { return t.indexOf(kw) > -1; });
      });
    }

    /* 我的菜单按加入时间倒序（新加的排前面，方便引导 / 回看） */
    if (tab === 'mine') {
      list = list.slice().sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    }

    const selIds = this.data.selectedIds;
    const selNear = this.data.selectedNear;
    list = list.map(function (d) {
      return Object.assign({}, d, {
        image: d.image || store.PLACEHOLDER,
        selected: tab === 'mine' ? selIds.indexOf(d.id) > -1 : selNear === d.id
      });
    });

    let barText = tab === 'mine' ? '点击 ＋ 添加你想吃的菜吧～' : '点右侧纸飞机，选一家想去的吧～';
    let barCount = 0;
    if (tab === 'mine') {
      const chosen = list.filter(function (d) { return d.selected; });
      barCount = chosen.length;
      if (chosen.length) {
        const total = chosen.reduce(function (s, d) { return s + (d.minutes || 0); }, 0);
        barText = '已加入 ' + chosen.length + ' 道菜 · 预计耗时 ' + total + ' 分钟';
      }
    } else {
      const near = list.filter(function (d) { return d.selected; })[0];
      barCount = near ? 1 : 0;
      if (near) barText = '已选 ' + near.name + (near.price ? ' · 预估 ¥' + near.price : '');
    }

    this.setData({
      isEmpty: false,
      categories: store.getCategories(tab),
      list: list,
      barText: barText,
      barCount: barCount
    });
  },

  /** 空态块高度 = 头部以下可视区（复刻原型 menu-body flex:1 的垂直居中） */
  layoutEmpty() {
    const that = this;
    setTimeout(function () {
      guide.measure('.menu-head').then(function (r) {
        if (!r || !that.data.isEmpty) return;
        const h = Math.max(240, guide.device().windowHeight - r.bottom);
        if (h !== that.data.emptyH) that.setData({ emptyH: h });
      });
    }, 60);
  },

  /** 空态 ＋：去添加页（附近美食 tab → 出去吃模式「添加美食」） */
  onEmptyAdd() {
    if (guide.getStep()) return;
    wx.reLaunch({ url: this.data.tab === 'nearby' ? '/pages/add/add?type=nearby' : '/pages/add/add' });
  },

  onTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === this.data.tab) return;
    this.setData({ tab: tab, cat: '全部', keyword: '' }, () => this.refresh());
  },

  onCat(e) {
    this.setData({ cat: e.currentTarget.dataset.cat }, () => this.refresh());
  },

  onSearch(e) {
    this.setData({ keyword: e.detail.value }, () => this.refresh());
  },

  onToggleSelect(e) {
    const id = e.currentTarget.dataset.id;
    if (this.data.tab === 'mine') {
      const ids = this.data.selectedIds.slice();
      const i = ids.indexOf(id);
      if (i > -1) ids.splice(i, 1); else ids.push(id);
      this.setData({ selectedIds: ids }, () => this.refresh());
    } else {
      this.setData({ selectedNear: this.data.selectedNear === id ? '' : id }, () => this.refresh());
    }
  },

  onOpenDish(e) {
    if (guide.getStep()) return;
    wx.reLaunch({ url: '/pages/add/add?id=' + e.currentTarget.dataset.id });
  },

  onGo() {
    if (!this.data.barCount) {
      wx.showToast({ title: this.data.tab === 'mine' ? '先在列表里选几道菜吧' : '先选一家想去的吧', icon: 'none' });
      return;
    }
    if (this.data.tab === 'mine') {
      /* 记入今日饮食 + 打开备菜清单（R30 定稿：不再跳「我的」页） */
      const dishes = [];
      this.data.selectedIds.forEach((id) => {
        const d = store.getDish(id);
        if (d) {
          store.addRecord(d, store.defaultSlot());
          dishes.push(d);
        }
      });
      wx.showToast({ title: '已记入今日饮食', icon: 'none' });
      this.setData({ selectedIds: [] }, () => this.refresh());
      if (dishes.length) this.openPrep(dishes);
    } else {
      /* 出去吃：无备菜清单，保持原行为（记入 + 回我的页） */
      const d = store.getDish(this.data.selectedNear);
      if (d) store.addRecord(d, store.defaultSlot());
      wx.showToast({ title: '已记入今日饮食', icon: 'none' });
      this.setData({ selectedNear: '' });
      wx.reLaunch({ url: '/pages/profile/profile' });
    }
  },

  /* ================= 备菜清单弹框（T1 · R30 定稿） ================= */

  openPrep(dishes) {
    const v = prep.build(dishes);
    this._prepLastTop = 0;
    this._prepStepsTop = 0;
    this._prepDishTop = 0;
    this.setData({
      prep: {
        on: true, view: 'dish', stepView: 'serial', into: '',
        count: v.count, totalMinutes: v.totalMinutes, stepCount: v.stepCount,
        ingredients: v.ingredients, serial: v.serial, cross: v.cross
      }
    }, () => {
      /* 新开默认定位在【菜品】模块（R30） */
      this.setData({ 'prep.into': 'prep-anchor-dish' });
      this.measurePrep();
    });
  },

  onPrepClose() {
    this.setData({ 'prep.on': false, 'prep.into': '', 'prep.view': 'dish' });
  },

  /** 空手势处理（弹框遮罩层阻止穿透滚动用） */
  noop() {},

  onPrepTab(e) {
    const v = e.currentTarget.dataset.v;
    const p = this.data.prep;
    if (v === p.view && v !== 'dish') return;
    if (v === 'dish') {
      /* 【菜品】= 滚动聚焦到菜品模块（内容常驻，不切换） */
      this.setData({ 'prep.view': 'dish', 'prep.into': 'prep-anchor-dish' });
      return;
    }
    /* 记住手动选的模式，上滑回来时恢复（R30） */
    this.setData({ 'prep.view': v, 'prep.stepView': v, 'prep.into': '' });
  },

  /** 一道一道做：点菜头折叠 / 展开 */
  onPrepGroup(e) {
    const i = e.currentTarget.dataset.index;
    this.setData({ ['prep.serial[' + i + '].open']: !this.data.prep.serial[i].open });
  },

  /**
   * 滚动联动（R30）：
   * 上滑进入步骤区 → 切到「上次手动选的步骤模式」；
   * 下滑深入菜品区 → 页签归位【菜品】（内容不动，stepView 保留）。
   * 判方向是为了避免点【菜品】时 scroll-into-view 的平滑滚动被误判。
   */
  onPrepScroll(e) {
    if (!this.data.prep.on) return;
    const t = e.detail.scrollTop;
    const last = this._prepLastTop || 0;
    const up = t < last - 1;
    const down = t > last + 1;
    this._prepLastTop = t;

    const p = this.data.prep;
    if (up && p.view === 'dish' && t <= (this._prepStepsTop || 0) + 20) {
      if (p.view !== p.stepView) {
        this.setData({ 'prep.view': p.stepView, 'prep.into': '' });
      }
    } else if (down && p.view !== 'dish' && t >= (this._prepDishTop || 0) - 40) {
      this.setData({ 'prep.view': 'dish', 'prep.into': '' });
    }
  },

  /** 测量步骤区 / 菜品区在滚动内容中的偏移（图片加载会改变高度，延迟测量） */
  measurePrep() {
    const that = this;
    setTimeout(function () {
      const q = wx.createSelectorQuery().in(that);
      q.select('.prep__scroll').boundingClientRect();
      q.select('#prep-anchor-steps').boundingClientRect();
      q.select('#prep-anchor-dish').boundingClientRect();
      q.exec(function (rs) {
        if (!rs || !rs[0] || !rs[1] || !rs[2]) return;
        const base = rs[0].top + (that._prepLastTop || 0);
        that._prepStepsTop = rs[1].top - base;
        that._prepDishTop = rs[2].top - base;
      });
    }, 350);
  },

  /* ================= 分享长图（T1） ================= */

  onPrepShare() {
    const that = this;
    const p = this.data.prep;
    /* 在菜品模块点分享：按上次选的步骤模式生成（与原型一致） */
    const mode = p.view === 'cross' ? 'cross' : (p.view === 'serial' ? 'serial' : p.stepView);
    wx.showLoading({ title: '生成中', mask: true });
    poster.render(this, {
      count: p.count, totalMinutes: p.totalMinutes,
      ingredients: p.ingredients, serial: p.serial, cross: p.cross
    }, { mode: mode }).then(function (path) {
      wx.hideLoading();
      that.setData({ 'poster.on': true, 'poster.path': path });
    }).catch(function (err) {
      wx.hideLoading();
      console.error('poster render fail', err);
      wx.showToast({ title: '长图生成失败，再试一次', icon: 'none' });
    });
  },

  onPosterClose() {
    this.setData({ 'poster.on': false });
  },

  /** 点预览图：微信原生的图片预览（可发送给好友） */
  onPosterPreview() {
    const path = this.data.poster.path;
    if (path) wx.previewImage({ urls: [path] });
  },

  onPosterSave() {
    const that = this;
    if (this.data.poster.saving || !this.data.poster.path) return;
    this.setData({ 'poster.saving': true });
    wx.saveImageToPhotosAlbum({
      filePath: this.data.poster.path,
      success: function () {
        wx.showToast({ title: '已保存到相册', icon: 'success' });
      },
      fail: function (err) {
        /* errno 104：隐私协议未同意 / 未声明（T2 接入隐私弹窗后可用） */
        if (err && err.errMsg && err.errMsg.indexOf('auth') > -1) {
          wx.showModal({
            title: '需要相册权限',
            content: '请在设置里允许保存到相册',
            confirmText: '去设置',
            success: function (r) {
              if (r.confirm) wx.openSetting();
            }
          });
        } else if (!err || !(err.errMsg && err.errMsg.indexOf('cancel') > -1)) {
          wx.showToast({ title: '保存失败，可长按图片转发', icon: 'none' });
        }
      },
      complete: function () {
        that.setData({ 'poster.saving': false });
      }
    });
  },

  /** 好友分享卡片（R29：导流用，四 tab 统一） */
  onShareAppMessage() {
    return {
      title: '今天吃什么？让猫咪帮你决定～',
      path: '/pages/home/home',
      imageUrl: '/assets/images/ip/share-card.jpg'
    };
  },

  /* ================= 引导（第七步） ================= */

  applyGuideView() {
    const last = guide.getLastDish();
    const hit = this.data.list.filter(function (d) { return d.name === last; })[0];
    this.setData({
      highlightName: hit ? hit.name : (this.data.list.length ? this.data.list[0].name : '')
    }, () => {
      const g = guide.baseState();
      g.step = STEP.MENU_ROW;
      g.block = true;
      g.ring = true;
      g.ringBlock = true;
      g.liftDishRow = true;
      g.liftTab = 'menu';
      g.toast = '添加的菜品，可以在菜单页进行查看～';
      g.toastGone = false;
      this.setData({ g: g }, () => this.layoutGuide());

      this.clearTimers();
      this.toastTimer = setTimeout(() => this.setData({ 'g.toastGone': true }), 2000);
      /* toast 淡出后（2s + .4s）再出现【继续添加】气泡，同时取消【菜单】tab 高亮 */
      this.stepTimer = setTimeout(() => {
        this.stepTimer = null;
        if (guide.getStep() !== STEP.MENU_ROW) return;
        this.setData({
          'g.toast': '',
          'g.liftTab': '',
          'g.hint': '去添加更多你的专属菜品吧',
          'g.hintBtn': '继续添加',
          'g.hintBig': true
        }, () => this.layoutTip());
      }, 2400);
    });
  },

  layoutGuide() {
    const rows = this.data.list;
    if (!rows.length) return;
    const index = this.data.highlightName
      ? rows.map(function (d) { return d.name; }).indexOf(this.data.highlightName)
      : 0;
    guide.measure('#dish-row-' + (index < 0 ? 0 : index)).then((r) => {
      if (!r || guide.getStep() !== STEP.MENU_ROW) return;
      const px = guide.px;
      this.setData({
        'g.blockStyle': 'left:' + (r.left - px(8)) + 'px;top:' + (r.top - px(8)) +
          'px;width:' + (r.width + px(16)) + 'px;height:' + (r.height + px(16)) +
          'px;border-radius:' + px(18) + 'px;',
        'g.ringStyle': 'left:' + (r.left - px(5)) + 'px;top:' + (r.top - px(5)) +
          'px;width:' + (r.width + px(10)) + 'px;height:' + (r.height + px(10)) +
          'px;border-radius:' + px(18) + 'px;'
      });
    });
  },

  layoutTip() {
    /* 气泡：页面上下居中 */
    guide.measure('.g-hint--big').then((h) => {
      if (!h) return;
      const top = Math.max(0, Math.round(guide.device().windowHeight / 2 - h.height / 2));
      this.setData({ 'g.hintStyle': 'top:' + top + 'px;' });
    });
  },

  onGuideHintTap() {},

  onGuideHintBtn() {
    if (guide.getStep() === STEP.MENU_ROW) this.endGuide();
  },

  onGuideMaskTap() {
    if (guide.getStep() === STEP.MENU_ROW) this.endGuide();
  },

  onGuideSkip() {},

  /** 引导结束：停在本页（菜单），蒙层消失 */
  endGuide() {
    guide.setStep(0);
    guide.markSeen();
    this.clearTimers();
    this.setData({ 'g.step': 0 });
  }
});
