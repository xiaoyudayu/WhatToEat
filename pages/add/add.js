const store = require('../../utils/store');
const guide = require('../../utils/guide');

const STEP = guide.STEP;
let stepKey = 0;

Page({
  data: {
    statusBarHeight: 44,
    title: '添加菜品',
    detail: false,          /* 从菜单点某道菜进来 = 详情态（顶栏改名 + 左下角可删除） */
    dishId: '',
    image: '',
    dishName: '',
    dishType: 'mine',        /* mine = 自己做 / nearby = 出去吃（决定做菜步骤 or 地址导航） */
    address: '',             /* 出去吃：门店地址（手输或地图选点回填） */
    latitude: 0,             /* 出去吃：地图选点得到的纬度（0 = 未标注，不能导航） */
    longitude: 0,            /* 出去吃：地图选点得到的经度 */
    tags: [],
    ingredients: [],
    steps: [],
    totalMinutes: 0,
    editingChips: '',        /* 'tag' | 'ing' | ''：长按进入晃动 + 右上角 ✕ 的编辑态 */
    stepDragging: false,     /* 做菜步骤长按拖动中（拖动期间锁页面滚动） */
    stepDragIndex: -1,
    stepDragY: 0,
    stepDragH: 0,
    stepDropIndex: -1,
    modalOpen: false,
    nmInput: '',
    nmFocus: false,
    penX: -999,              /* 便签画笔位置（px，相对 .name-modal__field） */
    penY: -999,
    g: guide.baseState()
  },

  onLoad(options) {
    this.setData({ statusBarHeight: guide.device().statusBarHeight });
    const opt = options || {};

    /* 从菜单页点某道菜进来 = 菜品 / 美食详情 */
    if (opt.id) {
      const dish = store.getDish(opt.id);
      if (dish) {
        stepKey = 0;
        this.setData({
          detail: true,
          dishId: dish.id,
          image: dish.image || '',
          dishName: dish.name || '',
          dishType: dish.type || 'mine',
          address: dish.address || '',
          latitude: dish.latitude || 0,
          longitude: dish.longitude || 0,
          tags: (dish.tags || []).slice(),
          ingredients: (dish.ingredients || []).slice(),
          steps: (dish.steps || []).map((s) => { stepKey += 1; return { key: 's' + stepKey, text: s.text, minutes: s.minutes || 0 }; }),
          totalMinutes: dish.minutes || 0
        }, () => this.syncTitle());
        return;
      }
    }

    if (opt.type === 'nearby') this.setData({ dishType: 'nearby' });

    /* 「添加」引导（第四步）：主流程走完/被跳过后，用户第一次自己点开添加页
       （tab ＋ / 菜单空态 ＋ / 任意新建入口）在此亮起，不再定时自动触发。
       详情入口（带 id）不消费标记 —— 引导需要在新建态展示。 */
    if (guide.takePendingAdd()) guide.setStep(STEP.ADD_MODAL);

    /* 新建菜品：进页面就亮出菜名编辑框（与原型一致） */
    this.setData({}, () => this.syncTitle());
    this.openTimer = setTimeout(() => {
      this.openTimer = null;
      if (!this.data.dishName && !this.data.modalOpen) this.openNameModal();
    }, 300);
  },

  /** 顶栏标题：新建 = 添加菜品/添加美食；详情 = 菜品详情/美食详情 */
  syncTitle() {
    const out = this.data.dishType === 'nearby';
    const title = this.data.detail
      ? (out ? '美食详情' : '菜品详情')
      : (out ? '添加美食' : '添加菜品');
    if (title !== this.data.title) this.setData({ title: title });
  },

  onShow() {
    const step = guide.getStep();
    if (step === STEP.ADD_MODAL) {
      /* 第四步：直接亮出菜名弹窗 */
      this.setData({
        modalOpen: true,
        nmInput: '',
        nmFocus: true,
        dishName: '',
        dishType: 'mine',
        tags: [],
        ingredients: [],
        steps: [],
        totalMinutes: 0,
        image: ''
      }, () => { this.applyGuideView(); setTimeout(() => this.updatePen(), 120); });
    } else if (step === STEP.ADD_TAGS || step === STEP.ADD_TRY) {
      if (!this.data.dishName) this.setData({ dishName: '番茄炒蛋' });
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
    if (this.dropTimer) { clearTimeout(this.dropTimer); this.dropTimer = null; }
    if (this.stepTimer) { clearTimeout(this.stepTimer); this.stepTimer = null; }
    if (this.toastTimer) { clearTimeout(this.toastTimer); this.toastTimer = null; }
    if (this.openTimer) { clearTimeout(this.openTimer); this.openTimer = null; }
  },

  /** 详情态：从菜单中删除这道菜（二次确认 → 回首页） */
  onDeleteDish() {
    const that = this;
    wx.showModal({
      title: '删除「' + (this.data.dishName || '这道菜') + '」？',
      content: '删除后将从你的菜单中移除，之后随机推荐不会再出现它',
      confirmText: '删除',
      confirmColor: '#E2622F',
      success(res) {
        if (!res.confirm) return;
        store.removeDish(that.data.dishId);
        wx.showToast({ title: '已从菜单中删除', icon: 'none' });
        wx.reLaunch({ url: '/pages/home/home' });
      }
    });
  },

  /* ================= 表单 ================= */

  onBack() {
    /* 与保存一致：出去吃模式返回也落在「附近美食」卡 */
    wx.reLaunch({
      url: this.data.dishType === 'nearby' ? '/pages/menu/menu?tab=nearby' : '/pages/menu/menu'
    });
  },

  onChooseImage() {
    const that = this;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success(res) {
        const tmp = res.tempFiles && res.tempFiles[0] && res.tempFiles[0].tempFilePath;
        if (!tmp) return;
        /* 拷进用户目录，避免临时路径过期 */
        const fs = wx.getFileSystemManager();
        const target = wx.env.USER_DATA_PATH + '/dish-' + Date.now() + '.png';
        fs.copyFile({
          srcPath: tmp,
          destPath: target,
          success() { that.setData({ image: target }); },
          fail() { that.setData({ image: tmp }); }
        });
      }
    });
  },

  openNameModal() {
    this.setData({ modalOpen: true, nmInput: this.data.dishName, nmFocus: true }, () => {
      /* 便签画笔初始定位（弹窗渲染后再量） */
      setTimeout(() => this.updatePen(), 120);
    });
  },

  onNameInput(e) {
    this.setData({ nmInput: e.detail.value }, () => this.updatePen());
  },

  /* ---------------- 便签画笔：笔尖实时锚在光标处 ---------------- */

  /** 量出输入内容宽度（canvas measureText，量不到就按字数估算） */
  measureTextWidth(v, cb) {
    const fallback = () => {
      let w = 0;
      for (const ch of v) w += /[\x00-\xff]/.test(ch) ? 9 : 17;
      cb(w);
    };
    if (this._penCtx) { cb(this._penCtx.measureText(v).width); return; }
    const q = wx.createSelectorQuery().in(this);
    q.select('#pen-canvas').fields({ node: true }).exec((res) => {
      const canvas = res && res[0] && res[0].node;
      if (!canvas || !canvas.getContext) { fallback(); return; }
      try {
        const ctx = canvas.getContext('2d');
        ctx.font = '17px "Songti SC", "STSong", serif';
        this._penCtx = ctx;
        cb(ctx.measureText(v).width);
      } catch (e) { fallback(); }
    });
  },

  /** 画笔定位：cx = 输入框水平中心 + 文本一半宽；cy = 书写基线附近 */
  updatePen() {
    if (!this.data.modalOpen) return;
    const v = this.data.nmInput || '';
    this.measureTextWidth(v, (tw) => {
      const q = wx.createSelectorQuery().in(this);
      q.select('#nm-input').boundingClientRect();
      q.select('.name-modal__field').boundingClientRect();
      q.exec((res) => {
        const inp = res && res[0];
        const field = res && res[1];
        if (!inp || !field || !inp.width) return;
        const maxW = inp.width - 12;
        const tw2 = Math.min(tw, maxW);
        const cx = (inp.width + tw2) / 2 - 2;             /* 居中文本的 caret x */
        const cy = (inp.top - field.top) + inp.height - 4;    /* 笔尖落在书写线（输入框底部虚线）上 */
        const pw = 37, ph = 46;                            /* 画笔 74rpx 宽，素材比例 450×560 */
        this.setData({ penX: cx - pw * 0.87, penY: cy - ph * 0.07 });
      });
    });
  },

  onTypeTap(e) {
    /* 自己做 / 出去吃：切换下层内容（做菜步骤 ↔ 地址与导航）并同步标题 */
    this.setData({ dishType: e.currentTarget.dataset.type }, () => this.syncTitle());
  },

  /* ---------------- 出去吃：地址与导航 ---------------- */

  /** 手动输入地址（兜底路径：不定位、不产生坐标） */
  onEditAddress() {
    const that = this;
    wx.showModal({
      title: this.data.address ? '修改门店地址' : '添加门店地址',
      editable: true,
      placeholderText: '例如：幸福路 12 号 · 川味小馆',
      content: this.data.address || '',
      success(res) {
        if (!res.confirm) return;
        /* 手输地址拿不到坐标：清掉旧标注，避免「地址改了、导航还去老地方」 */
        that.setData({ address: (res.content || '').trim(), latitude: 0, longitude: 0 });
      }
    });
  },

  /** 在地图上选点：拿到真实坐标 + 门牌名，之后导航才会去对地方 */
  onPickLocation() {
    const that = this;
    if (!wx.chooseLocation) {          /* 基础库过低：退回手动输入，不报错 */
      this.onEditAddress();
      return;
    }
    wx.chooseLocation({
      success(res) {
        const addr = (res.address || '') + (res.name ? ' · ' + res.name : '');
        that.setData({
          address: addr || that.data.address,
          latitude: res.latitude,
          longitude: res.longitude
        });
      },
      fail(err) {
        const msg = (err && err.errMsg) || '';
        if (msg.indexOf('cancel') > -1) return;   /* 用户主动取消：不打扰 */
        wx.showToast({ title: '未选点，也可以手动输入地址', icon: 'none' });
      }
    });
  },

  /** 打开地图 App 导航（坐标来自上面的选点，不再使用写死坐标） */
  onOpenMap() {
    const addr = this.data.address;
    const lat = this.data.latitude;
    const lng = this.data.longitude;
    if (!lat || !lng) {
      /* 还没标注位置：直接引导去地图上选点（比先弹一句提示更好用） */
      this.onPickLocation();
      return;
    }
    wx.openLocation({
      latitude: lat,
      longitude: lng,
      name: this.data.dishName || addr,
      address: addr,
      scale: 16,
      fail() {
        /* 兜底：复制地址，用户可粘到任意导航 App */
        wx.setClipboardData({
          data: addr,
          success() { wx.showToast({ title: '地址已复制，可粘贴到导航 App', icon: 'none' }); }
        });
      }
    });
  },

  onModalOk() {
    const v = (this.data.nmInput || '').trim();
    if (!v) { this.setData({ nmFocus: true }); return; }
    this.setData({ dishName: v, modalOpen: false, nmFocus: false });

    if (guide.getStep() === STEP.ADD_MODAL) {
      /* 至少完成菜名 → 第五步：高亮标签+食材，toast 2s 后自动进【去试试吧】引导 */
      this.startStep5();
    }
  },

  onModalCancel() {
    if (guide.getStep() === STEP.ADD_MODAL) {
      /* 弹窗「取消」= 跳过：菜名还没填，不进菜单页，直接结束添加引导 */
      this.endGuide();
      return;
    }
    this.setData({ modalOpen: false, nmFocus: false });
  },

  /* ---------------- 标签 / 食材 ---------------- */

  onAddChip(e) {
    const kind = e.currentTarget.dataset.kind;
    const that = this;
    wx.showModal({
      title: kind === 'tag' ? '添加标签' : '添加食材',
      editable: true,
      placeholderText: kind === 'tag' ? '例如：酸甜、下饭' : '例如：鸡蛋、番茄',
      success(res) {
        if (!res.confirm) return;
        const v = (res.content || '').trim();
        if (!v) return;
        if (kind === 'tag') that.setData({ tags: that.data.tags.concat(v) });
        else that.setData({ ingredients: that.data.ingredients.concat(v) });
      }
    });
  },

  onEditChip(e) {
    const kind = e.currentTarget.dataset.kind;
    const index = e.currentTarget.dataset.index;
    const key = kind === 'tag' ? 'tags' : 'ingredients';
    const that = this;
    wx.showModal({
      title: '修改' + (kind === 'tag' ? '标签' : '食材'),
      editable: true,
      content: that.data[key][index],
      success(res) {
        if (!res.confirm) return;
        const v = (res.content || '').trim();
        if (!v) return;
        const list = that.data[key].slice();
        list[index] = v;
        if (kind === 'tag') that.setData({ tags: list });
        else that.setData({ ingredients: list });
      }
    });
  },

  /** 长按标签 / 食材 → 进入编辑态（整体晃动 + 右上角出现 ✕） */
  onChipLongPress(e) {
    const kind = e.currentTarget.dataset.kind;
    if (this.data.editingChips === kind) return;
    if (wx.vibrateShort) { try { wx.vibrateShort({ type: 'light' }); } catch (err) { /* ignore */ } }
    this.setData({ editingChips: kind });
  },

  /** 点标签：编辑态下先退出编辑态；平时进入重编辑 */
  onChipTap(e) {
    if (this.data.editingChips) { this.setData({ editingChips: '' }); return; }
    this.onEditChip(e);
  },

  /** 点页面空白处：退出标签 / 食材编辑态 */
  onPageTap() {
    if (this.data.editingChips) this.setData({ editingChips: '' });
  },

  /** 点右上角 ✕ 才真正删除（该组删空后自动退出编辑态） */
  onRemoveChip(e) {
    const kind = e.currentTarget.dataset.kind;
    const index = e.currentTarget.dataset.index;
    const key = kind === 'tag' ? 'tags' : 'ingredients';
    const list = this.data[key].slice();
    list.splice(index, 1);
    const editingChips = list.length ? kind : '';
    if (kind === 'tag') this.setData({ tags: list, editingChips: editingChips });
    else this.setData({ ingredients: list, editingChips: editingChips });
  },

  /* ---------------- 做菜步骤 ---------------- */

  onAddStep() {
    const that = this;
    wx.showModal({
      title: '添加做菜步骤',
      editable: true,
      placeholderText: '例如：热锅下油，炒散鸡蛋',
      success(res) {
        if (!res.confirm) return;
        const v = (res.content || '').trim();
        if (!v) return;
        /* 紧接着问用时（取消或填错则按默认 5 分钟） */
        wx.showModal({
          title: '这一步用时（分钟）',
          editable: true,
          placeholderText: '默认 5 分钟',
          success(r2) {
            const n = parseInt(r2.content, 10);
            const minutes = (r2.confirm && !isNaN(n) && n > 0) ? n : 5;
            stepKey += 1;
            const steps = that.data.steps.concat({ key: 's' + stepKey, text: v, minutes: minutes });
            that.setData({ steps: steps, totalMinutes: that.sumMinutes(steps) });
          }
        });
      }
    });
  },

  onRemoveStep(e) {
    if (this.data.stepDragging || this.justDragged) return;
    const index = e.currentTarget.dataset.index;
    const steps = this.data.steps.slice();
    steps.splice(index, 1);
    this.setData({ steps: steps, totalMinutes: this.sumMinutes(steps) });
  },

  onEditStepText(e) {
    if (this.data.stepDragging || this.justDragged) return;
    const index = e.currentTarget.dataset.index;
    const that = this;
    wx.showModal({
      title: '修改步骤',
      editable: true,
      content: this.data.steps[index].text,
      success(res) {
        if (!res.confirm) return;
        const v = (res.content || '').trim();
        if (!v) return;
        const steps = that.data.steps.slice();
        steps[index] = Object.assign({}, steps[index], { text: v });
        that.setData({ steps: steps });
      }
    });
  },

  onEditStepMinutes(e) {
    if (this.data.stepDragging || this.justDragged) return;
    const index = e.currentTarget.dataset.index;
    const that = this;
    wx.showModal({
      title: '这一步用几分钟？',
      editable: true,
      content: String(this.data.steps[index].minutes),
      success(res) {
        if (!res.confirm) return;
        const n = parseInt(res.content, 10);
        if (isNaN(n) || n < 0) return;
        const steps = that.data.steps.slice();
        steps[index] = Object.assign({}, steps[index], { minutes: n });
        that.setData({ steps: steps, totalMinutes: that.sumMinutes(steps) });
      }
    });
  },

  sumMinutes(steps) {
    return steps.reduce(function (s, x) { return s + (x.minutes || 0); }, 0);
  },

  /* ---------------- 做菜步骤：长按整行上下拖动换序 ---------------- */

  onStepTouchStart(e) {
    this.stepTouchY = e.touches[0].clientY;
  },

  /** 长按整行 → 进入拖动（量出各行位置，作为落点判断基准） */
  onStepLongPress(e) {
    if (this.data.steps.length < 2) return;
    const index = Number(e.currentTarget.dataset.index);
    if (isNaN(index)) return;
    const q = wx.createSelectorQuery().in(this);
    q.selectAll('.step-row').boundingClientRect();
    q.exec((res) => {
      const rows = (res && res[0]) || [];
      if (rows.length < 2 || !rows[index]) return;
      this.dragRects = rows.map(function (r) { return { top: r.top, height: r.height }; });
      this.dragStartY = (typeof this.stepTouchY === 'number')
        ? this.stepTouchY
        : this.dragRects[index].top + this.dragRects[index].height / 2;
      if (wx.vibrateShort) { try { wx.vibrateShort({ type: 'light' }); } catch (err) { /* ignore */ } }
      this.setData({
        stepDragging: true,
        stepDragIndex: index,
        stepDropIndex: index,
        stepDragY: 0,
        stepDragH: this.dragRects[index].height
      });
    });
  },

  /** 拖动：行跟手 + 用「拖动行的中心」决定落点序号 */
  onStepTouchMove(e) {
    if (!this.data.stepDragging || !this.dragRects) return;
    const rects = this.dragRects;
    const from = this.data.stepDragIndex;
    const h = this.data.stepDragH;
    if (!rects[from]) return;
    const minOff = rects[0].top - rects[from].top;
    const last = rects[rects.length - 1];
    const maxOff = (last.top + last.height) - (rects[from].top + h);
    const offset = Math.min(Math.max(e.touches[0].clientY - this.dragStartY, minOff), maxOff);
    const center = rects[from].top + offset + h / 2;
    /* 落点用「前缘」判定（下行看拖动行的下缘、上行看上缘）：
       比「中心点比较」更符合手感，且行高不一时也不会差格 */
    const edge = offset < 0 ? (center - h / 2) : (center + h / 2);
    let target = 0;
    for (let i = 0; i < rects.length; i += 1) {
      if (i === from) continue;
      if (rects[i].top + rects[i].height / 2 < edge) target += 1;
    }
    if (target > rects.length - 1) target = rects.length - 1;
    const patch = {};
    if (Math.abs(offset - this.data.stepDragY) >= 1) patch.stepDragY = Math.round(offset);
    if (target !== this.data.stepDropIndex) patch.stepDropIndex = target;
    if (Object.keys(patch).length) this.setData(patch);
  },

  /** 松手：按落点重排步骤（序号由 index 渲染，总用时不变） */
  onStepTouchEnd() {
    if (!this.data.stepDragging) return;
    const from = this.data.stepDragIndex;
    const to = this.data.stepDropIndex;
    const steps = this.data.steps.slice();
    if (to > -1 && to !== from && from < steps.length && to < steps.length) {
      const moved = steps.splice(from, 1)[0];
      steps.splice(to, 0, moved);
    }
    this.dragRects = null;
    this.stepTouchY = null;
    this.justDragged = true;                  /* 抑制紧随其后的 tap（改文字 / 改时长） */
    if (this.dropTimer) clearTimeout(this.dropTimer);
    this.dropTimer = setTimeout(() => { this.dropTimer = null; this.justDragged = false; }, 320);
    this.setData({
      steps: steps,
      stepDragging: false,
      stepDragIndex: -1,
      stepDropIndex: -1,
      stepDragY: 0,
      stepDragH: 0
    });
  },

  onStepTouchCancel() {
    this.onStepTouchEnd();
  },

  /* ---------------- 去试试吧 ---------------- */

  onTry() {
    if (this.data.editingChips) this.setData({ editingChips: '' });
    if (guide.getStep() !== STEP.ADD_TRY && !this.data.dishName) {
      wx.showToast({ title: '先给这道菜起个名字吧', icon: 'none' });
      this.openNameModal();
      return;
    }

    /* 详情态改的就是同一道菜（优先用 dishId，改名也不会变成新增）；
       新建时若同名菜品已存在则更新，避免重复 */
    const name = this.data.dishName;
    const exist = store.getDishes(this.data.dishType).filter(function (d) { return d.name === name; })[0];
    const saved = store.saveDish({
      id: this.data.dishId || (exist ? exist.id : undefined),
      name: name,
      type: this.data.dishType,
      tags: this.data.tags,
      ingredients: this.data.ingredients,
      steps: this.data.steps.map(function (s) { return { text: s.text, minutes: s.minutes }; }),
      minutes: this.data.totalMinutes,
      address: this.data.dishType === 'nearby' ? this.data.address : '',
      latitude: this.data.dishType === 'nearby' ? this.data.latitude : 0,
      longitude: this.data.dishType === 'nearby' ? this.data.longitude : 0,
      image: this.data.image || (exist ? exist.image : ''),
      createdAt: Date.now()
    });

    if (guide.getStep() === STEP.ADD_TRY) {
      guide.setLastDish(saved.name);
      guide.setStep(STEP.MENU_ROW);
    }
    /* 保存后回菜单页：出去吃 → 落在「附近美食」卡；自己做 → 「我的菜单」 */
    wx.reLaunch({
      url: this.data.dishType === 'nearby' ? '/pages/menu/menu?tab=nearby' : '/pages/menu/menu'
    });
  },

  /* ================= 引导（第四 / 五 / 六步） ================= */

  applyGuideView() {
    const step = guide.getStep();
    const g = guide.baseState();
    g.step = step;

    if (step === STEP.ADD_MODAL) {
      g.skip = true;
      g.skipTop = this.data.statusBarHeight + 44;
      g.liftTab = 'add';
      g.hand = 'bob';
    } else if (step === STEP.ADD_TAGS) {
      g.block = true;
      g.ring = true;
      g.ringBlock = true;
      g.liftTagZone = true;
      g.toast = '还可以添加它的口味和食材';
      g.toastGone = false;
    } else if (step === STEP.ADD_TRY) {
      g.ring = true;
      g.hand = 'down';
      g.rip = true;
      g.glowFab = true;
      g.liftFab = true;
    }

    this.setData({ g: g }, () => this.layoutGuide());

    if (step === STEP.ADD_TAGS) {
      this.clearTimers();
      this.toastTimer = setTimeout(() => this.setData({ 'g.toastGone': true }), 2000);
      this.stepTimer = setTimeout(() => {
        this.stepTimer = null;
        if (guide.getStep() === STEP.ADD_TAGS) this.startStep6();
      }, 2400);
    }
  },

  startStep5() {
    guide.setStep(STEP.ADD_TAGS);
    this.applyGuideView();
  },

  startStep6() {
    guide.setStep(STEP.ADD_TRY);
    this.applyGuideView();
  },

  layoutGuide() {
    const step = guide.getStep();
    const px = guide.px;

    if (step === STEP.ADD_MODAL) {
      guide.measure('#name-modal').then((m) => {
        if (!m || guide.getStep() !== step) return;
        const off = guide.tipOffset(false);
        const cx = m.left + m.width / 2;
        const tipY = m.top + m.height + px(2);
        this.setData({ 'g.handStyle': 'left:' + (cx - off.dx) + 'px;top:' + (tipY - off.dy) + 'px;' });
      });
      return;
    }

    if (step === STEP.ADD_TAGS) {
      guide.measureAll(['#sec-tag', '#ing-chips']).then((res) => {
        const t = res[0];
        const i = res[1];
        if (!t || !i || guide.getStep() !== step) return;
        const left = px(14);
        const top = t.top - px(12);
        const w = guide.px(375) - px(28);
        const h = (i.top + i.height) - top + px(12);
        this.setData({
          'g.blockStyle': 'left:' + left + 'px;top:' + top + 'px;width:' + w +
            'px;height:' + h + 'px;border-radius:' + px(18) + 'px;',
          'g.ringStyle': 'left:' + (left - px(5)) + 'px;top:' + (top - px(5)) +
            'px;width:' + (w + px(10)) + 'px;height:' + (h + px(10)) + 'px;border-radius:' + px(20) + 'px;',
          /* toast 挂在高亮区正下方 */
          'g.toastStyle': 'top:' + (top + h + px(30)) + 'px;'
        });
      });
      return;
    }

    if (step === STEP.ADD_TRY) {
      guide.measure('#fab-check').then((b) => {
        if (!b || guide.getStep() !== step) return;
        const off = guide.tipOffset(true);
        const cx = b.left + b.width / 2;
        const tipY = b.top - px(2);
        this.setData({
          'g.ringStyle': 'left:' + (b.left - px(6)) + 'px;top:' + (b.top - px(6)) +
            'px;width:' + (b.width + px(12)) + 'px;height:' + (b.height + px(12)) +
            'px;border-radius:' + (b.height / 2 + px(6)) + 'px;',
          'g.handStyle': 'left:' + (cx - off.dx) + 'px;top:' + (tipY - off.dy) + 'px;',
          'g.ripStyle': 'left:' + (cx - px(23)) + 'px;top:' + (tipY - px(23)) + 'px;'
        });
      });
    }
  },

  onGuideMaskTap() {
    this.guideSkip();
  },

  onGuideSkip() {
    this.guideSkip();
  },

  onGuideHintTap() {},

  onGuideHintBtn() {},

  guideSkip() {
    const step = guide.getStep();
    if (step === STEP.ADD_MODAL) {
      /* 菜名还没填：跳过 = 结束添加引导 */
      this.endGuide();
    } else if (step === STEP.ADD_TAGS) {
      this.clearTimers();
      this.startStep6();
    } else if (step === STEP.ADD_TRY) {
      guide.setStep(STEP.MENU_ROW);
      wx.reLaunch({ url: '/pages/menu/menu' });
    }
  },

  endGuide() {
    guide.setStep(0);
    guide.markSeen();
    this.clearTimers();
    this.setData({ 'g.step': 0, modalOpen: false });
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
