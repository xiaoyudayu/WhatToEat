const pet = require('../../utils/pet');
const tips = require('../../utils/tips');

/**
 * 喵屋：猫架等级时间线 v2（2026-10-19 重构，账本口径不变）
 *
 * 结构（平台数 = 5，Lv1 落地 / Lv7 顶窝）：
 *   Lv1 地面 → Lv2/4/6 吊床（右）· Lv3/5 木板（左，横枝托板）→ Lv7 顶窝
 *   立柱 18rpx 细柱；横枝/横梁全部 CSS 绘制——层高不等高，贴图枝干对不齐
 *
 * 坐标：STOPS 显式落点表（rpx，750 设计稿坐标系，x/y = 猫爪站立点）。
 *   平台定位 / 猫站位 / 跳跃起止点 / 聚焦 scroll-top 全部读这张表，
 *   调布局只改表，不碰逻辑。
 *
 * 跳跃：外层 cat-pos 直线位移（transition transform），内层画弧 + 向上倾 + 轻微摆动；
 *   落地停一拍再转向（面朝立柱），对应「跳上去 → 再转向」的节奏。
 *
 * 聚焦：进页先滚到当前落点居中（首屏不播滚动动画），升级路径才开 scroll-with-animation。
 *   scroll-view 自身高度不依赖内容加载，onReady 测一次即可。
 */

/* 落点表（rpx）。side 只影响枝/梁方向；type 决定平台图与承托面偏移 */
const STOPS = [
  { lv: 1, type: 'ground',  x: 280, y: 1052 },
  { lv: 2, type: 'hammock', x: 468, y: 900, side: 'right' },
  { lv: 3, type: 'board',   x: 250, y: 748, side: 'left' },
  { lv: 4, type: 'hammock', x: 468, y: 596, side: 'right' },
  { lv: 5, type: 'board',   x: 250, y: 444, side: 'left' },
  { lv: 6, type: 'hammock', x: 468, y: 292, side: 'right' },
  { lv: 7, type: 'nest',    x: 375, y: 120 }
];

/* 平台图显示尺寸与 off =「图顶边在站立点上方多少」（rpx，按素材承托面位置标定）。
   v2.6 跳板/吊床放大 ~1.15 倍，off 按同比例缩放（承托面在图内的相对位置不变）；
   顶窝随之上移（y 134→120），给放大后抬头的 Lv6 吊床让出净空 */
const PLAT = {
  board:   { w: 134, h: 98,  off: 21 },
  hammock: { w: 184, h: 140, off: 83 },
  nest:    { w: 190, h: 190, off: 108 }
};

const TREE_H = 1108;                                   /* 树容器总高（rpx） */
/* 立柱顶端伸进顶窝后面（v2.1：原 top 210 露出太少，顶窝看着像凌空） */
/* 立柱（v2.7 加粗 18→24rpx，left 同步左移保持中心在 375 立柱轴线上） */
const POST = { left: 363, width: 24, top: 150, bottom: 1052 };
const GROUND_TILT = 0;                                 /* 地面站姿倾角：v2.3 起素材为趴平水平姿，无需压平（保留常量便于微调） */
/* 猫爪相对落点的下沉量（rpx）：平台素材的承托面在图内偏下，
   猫按落点 y 摆会悬空——按平台类型分开标定（v2.6 按用户反馈分档：
   地面大幅下沉、跳板再往下、吊床回调） */
const SINK = { board: 24, hammock: 26, nest: 34, ground: 16 };
const GROUND = { left: 150, width: 450, y: 1052 };
const POST_X = 375;

Page({
  data: {
    statusBarHeight: 44,
    treeH: 0,
    stops: [],
    decor: [],
    postStyle: '',
    groundStyle: '',
    catStyle: '',
    catDir: 'right',          /* 常态朝向：left/right */
    catHopDir: 'to-right',    /* 本次跳跃方向，决定空中倾角朝向 */
    jumping: false,
    fromPrev: false,          /* 起跳前站在上一落点（下蹲蓄力姿态） */
    catTilt: 0,               /* 站姿倾角（deg，仅地面落点非 0，跳跃时不套） */
    catTap: false,            /* 点猫互动：晃动 + 爱心 */
    catBubble: null,          /* 点猫冒出的猫语 */
    scrollTop: 0,
    scrollAnim: false,        /* 只有升级路径才开滚动动画 */
    s: null,
    levelUp: null,
    badge: '/assets/images/pet/badge.png'
  },

  onLoad() {
    const win = getApp().globalData;
    this.ratio = (win.windowWidth || 375) / 750;   /* rpx → px */
    this.viewH = 0;                                /* scroll-view 可视高（px），onReady 测量 */
    this.pendingFocus = false;
    this.setData({ statusBarHeight: win.statusBarHeight || 44 });
  },

  onReady() {
    /* scroll-view 自身高度与内容加载无关，可安全测量 */
    const q = wx.createSelectorQuery().in(this);
    q.select('.pet-tree').boundingClientRect();
    q.exec((res) => {
      this.viewH = (res && res[0] && res[0].height) || 340;
      if (this.pendingFocus) {
        this.pendingFocus = false;
        this.setData({ scrollTop: this.focusTop(this.data.s.lv) });
      }
    });
  },

  onShow() { this.refresh(); },
  onHide() { this.clearTimers(); },
  onUnload() { this.clearTimers(); },

  clearTimers() {
    [this.scrollTimer, this.jumpTimer, this.landingTimer, this.turnTimer,
      this.popupTimer, this.tapTimerA, this.tapTimerB].forEach((t) => {
        if (t) clearTimeout(t);
      });
    this.scrollTimer = this.jumpTimer = this.landingTimer = this.turnTimer = null;
    this.popupTimer = this.tapTimerA = this.tapTimerB = null;
  },

  /* ================= 坐标工具 ================= */

  rpx(v) { return Math.round(v * this.ratio); },
  stopOf(lv) { return STOPS[lv - 1]; },

  /* 常态站姿：面朝立柱（落在立柱左侧朝右，右侧朝左；顶窝朝右） */
  stanceOf(st) { return st.x <= POST_X ? 'right' : 'left'; },

  /* 站姿倾角：俯冲素材天生前倾，地面落点给反向角压平（前后爪同线） */
  tiltOf(st) { return st.type === 'ground' ? GROUND_TILT : 0; },

  /* 猫爪下沉量：猫真正踩在板面/吊锅内底/窝底上 */
  sinkOf(st) { return SINK[st.type] || 0; },

  catPoint(st) {
    return 'transform:translate(' + this.rpx(st.x) + 'px,' +
      this.rpx(st.y + this.sinkOf(st)) + 'px);';
  },

  /** 聚焦：当前落点（含下沉）滚到可视区 45% 高度处，夹在内容范围内 */
  focusTop(lv) {
    const vh = this.viewH || 340;
    const st = this.stopOf(lv);
    const max = Math.max(0, this.rpx(TREE_H) - vh);
    const top = Math.round(this.rpx(st.y + this.sinkOf(st)) - vh * 0.45);
    return Math.max(0, Math.min(max, top));
  },

  /* ================= 数据构建 ================= */

  buildStops(s) {
    return STOPS.map((st) => {
      const meta = pet.LEVELS[st.lv - 1];
      const isCur = st.lv === s.lv;
      const isNext = !s.maxed && s.nextNeed === meta.need;
      let note;
      if (st.lv < s.lv) note = '已达成';
      else if (isCur) note = '当前 ' + s.exp + ' 喵条';
      else if (isNext) note = '再 ' + s.remain + ' 喵条';
      else note = meta.need + ' 喵条';

      const item = {
        lv: st.lv,
        type: st.type,
        state: st.lv < s.lv ? 'done' : (isCur ? 'cur' : (isNext ? 'next' : 'lock')),
        lvText: 'Lv.' + st.lv,
        title: meta.title,
        note: note
      };

      const p = PLAT[st.type];
      if (p) {
        item.img = '/assets/images/pet/' + (st.type === 'nest' ? 'top-nest' : st.type) + '.png';
        item.platStyle = 'left:' + this.rpx(st.x - p.w / 2) + 'px;top:' + this.rpx(st.y - p.off) +
          'px;width:' + this.rpx(p.w) + 'px;height:' + this.rpx(p.h) + 'px;';
      }

      if (st.type === 'board') {
        /* 左侧木板：横枝从立柱伸到板底（板内缘 → 立柱左缘 366） */
        const edge = st.x + PLAT.board.w / 2;
        item.branchStyle = 'left:' + this.rpx(edge) + 'px;top:' + this.rpx(st.y + 26) +
          'px;width:' + this.rpx(POST.left - edge) + 'px;';
      } else if (st.type === 'hammock') {
        /* 右侧吊床：上方横梁（立柱右缘 → 外侧绳点），绳系梁上 */
        const beamL = POST.left + POST.width;
        item.branchStyle = 'left:' + this.rpx(beamL) + 'px;top:' + this.rpx(st.y - 76) +
          'px;width:' + this.rpx(st.x + 72 - beamL) + 'px;';
      }

      /* 名牌：平台对侧；顶窝专属左上 */
      const plateLeft = st.type === 'nest' ? 96 : (st.x <= POST_X ? 400 : 202);
      item.plateStyle = 'left:' + this.rpx(plateLeft) + 'px;top:' + this.rpx(st.y) + 'px;';
      return item;
    });
  },

  /** 挂饰：随等级逐级解锁（Lv2 起每升一级多一件），全部物理挂在支架上：
      毛球带挂绳压住横枝，铃铛横钉钉在立柱侧。本次升级刚解锁的（freshLv）pop 入场 */
  buildDecor(s, freshLv) {
    const yarn = '/assets/images/pet/yarn.png';
    const box = (x, y, w, h) => 'left:' + this.rpx(x) + 'px;top:' + this.rpx(y) +
      'px;width:' + this.rpx(w) + 'px;height:' + this.rpx(h) + 'px;';
    const defs = [
      /* 毛球：容器顶边压住横枝 4rpx（Lv3 枝 y774 / Lv5 枝 y470，枝起点 317=放大后板缘），绳 + 球 */
      { key: 'd1', type: 'yarn', src: yarn, need: 2, style: box(322, 770, 46, 65) },
      { key: 'd2', type: 'bell',          need: 3, style: box(346, 820, 26, 34) },
      { key: 'd3', type: 'yarn', src: yarn, need: 4, style: box(322, 466, 40, 58) },
      { key: 'd4', type: 'bell',          need: 5, style: box(346, 514, 26, 34) },
      { key: 'd5', type: 'bell',          need: 6, style: box(346, 214, 26, 34) }
    ];
    return defs.map((d) => ({
      key: d.key,
      type: d.type,
      src: d.src,
      sway: true,
      show: s.lv >= d.need,
      fresh: freshLv != null && d.need === freshLv,
      style: d.style
    }));
  },

  /* ================= 刷新与聚焦 ================= */

  refresh() {
    const s = pet.summary();
    const task = pet.takeJumpTask();   /* 消费式：读出即记 lastJumpLevel，不会重播 */

    const patch = {
      s: s,
      stops: this.buildStops(s),
      decor: this.buildDecor(s, task ? task.toLv : null),
      treeH: this.rpx(TREE_H),
      postStyle: 'left:' + this.rpx(POST.left) + 'px;top:' + this.rpx(POST.top) +
        'px;width:' + this.rpx(POST.width) + 'px;height:' + this.rpx(POST.bottom - POST.top) + 'px;',
      groundStyle: 'left:' + this.rpx(GROUND.left) + 'px;top:' + this.rpx(GROUND.y) +
        'px;width:' + this.rpx(GROUND.width) + 'px;'
    };

    if (task) {
      this.setData(patch, () => this.playArrival(task.fromLv, task.toLv));
      return;
    }

    /* 无升级任务：猫摆到当前落点（无过渡），静默聚焦 */
    const cur = this.stopOf(s.lv);
    patch.catStyle = this.catPoint(cur) + 'transition:none;';
    patch.catDir = this.stanceOf(cur);
    patch.catHopDir = 'to-right';
    patch.catTilt = this.tiltOf(cur);
    patch.jumping = false;
    patch.fromPrev = false;
    if (this.viewH) patch.scrollTop = this.focusTop(s.lv);
    else this.pendingFocus = true;
    this.setData(patch);
  },

  /* ================= 到达动画 ================= */

  playArrival(fromLv, toLv) {
    this.clearTimers();
    const from = this.stopOf(fromLv);
    const to = this.stopOf(toLv);
    const dir = to.x >= from.x ? 'to-right' : 'to-left';
    const faceDir = dir === 'to-right' ? 'right' : 'left';

    /* 1) 猫先站上一落点（无过渡摆位），面向跳跃方向下蹲蓄力 */
    this.setData({
      catStyle: this.catPoint(from) + 'transition:none;',
      catDir: faceDir,
      catHopDir: dir,
      jumping: false,
      fromPrev: true,
      scrollAnim: false
    });

    /* 2) 滚到目标落点居中（scroll-with-animation） */
    this.scrollTimer = setTimeout(() => {
      this.scrollTimer = null;
      this.setData({ scrollAnim: true, scrollTop: this.focusTop(to.lv) });
    }, 80);

    /* 3) 起跳：外层直线位移（transition），内层弧线 + 倾角 + 摆动 */
    this.jumpTimer = setTimeout(() => {
      this.jumpTimer = null;
      this.setData({ catStyle: this.catPoint(to), jumping: true, fromPrev: false });
    }, 560);

    /* 4) 落地回弹 → 停一拍转向（面朝立柱）→ 转向结束再弹升级层（v2.1） */
    this.landingTimer = setTimeout(() => {
      this.landingTimer = null;
      this.setData({ jumping: false, scrollAnim: false, catTilt: 0 });
      if (wx.vibrateShort) { try { wx.vibrateShort({ type: 'medium' }); } catch (e) { /* ignore */ } }
      this.turnTimer = setTimeout(() => {
        this.turnTimer = null;
        this.setData({ catDir: this.stanceOf(to), catTilt: this.tiltOf(to) });
        /* 转向过渡 .2s，再多留一拍让用户看清落定，弹层才上 */
        this.popupTimer = setTimeout(() => {
          this.popupTimer = null;
          const s = pet.summary();
          this.setData({
            levelUp: {
              fromLv: fromLv, toLv: toLv,
              title: s.title, image: s.image, medal: '/assets/images/pet/medal.png'
            }
          });
        }, 300);
      }, 260);
    }, 1340);
  },

  onLevelUpClose() {
    this.setData({ levelUp: null });
  },

  /* ================= 点猫互动：晃一晃 + 爱心 + 冒一句猫语 ================= */

  onCatTap() {
    if (this.data.jumping || this.data.catTap) return;
    if (wx.vibrateShort) { try { wx.vibrateShort({ type: 'light' }); } catch (e) { /* ignore */ } }
    this.setData({
      catTap: true,
      catBubble: tips.pickPetLine(this.data.catBubble || '')
    });
    this.tapTimerA = setTimeout(() => {
      this.tapTimerA = null;
      this.setData({ catTap: false });
    }, 850);
    this.tapTimerB = setTimeout(() => {
      this.tapTimerB = null;
      this.setData({ catBubble: null });
    }, 1600);
  },

  onBack() {
    /* 从 tab 页 navigateTo 进来，直接退；兜底回首页 */
    const pages = getCurrentPages();
    if (pages.length > 1) wx.navigateBack();
    else wx.reLaunch({ url: '/pages/home/home' });
  },

  /** 好友分享卡片（T1 · 四 tab 统一口径） */
  onShareAppMessage() {
    return {
      title: '今天吃什么？让猫咪帮你决定～',
      path: '/pages/home/home',
      imageUrl: '/assets/images/ip/share-card.jpg'
    };
  }
});
