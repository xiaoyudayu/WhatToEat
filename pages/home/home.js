const store = require('../../utils/store');
const guide = require('../../utils/guide');
const tips = require('../../utils/tips');
const pet = require('../../utils/pet');

const IDLE_NAME = '今天吃什么';
/** 引导期用固定脚本，保证结果停在「番茄炒蛋」上 */
const DEMO_ROLL = ['麻婆豆腐', '回锅肉', '鱼香肉丝', '宫保鸡丁', '糖醋排骨', '番茄炒蛋'];

const STEP = guide.STEP;

Page({
  data: {
    statusBarHeight: 44,
    mode: 'mine',
    dishName: IDLE_NAME,
    phase: 'idle',            // idle | rolling | result
    recLabel: '我的饮食手札',
    splashVisible: true,      // 开屏静态欢迎图（无动画，停留后直接移除）
    petVisible: true,         // IP 萌宠入口（仅首页）
    petBubble: true,          // 萌宠气泡（3s 后淡出）
    petBubbleText: tips.PET_GREETING,  // 气泡文案（首屏固定问候，之后随机猫语）
    pet: null,                // 喵条摘要（常驻等级泡；引导期隐藏）
    g: guide.baseState()
  },

  onLoad() {
    this.setData({ statusBarHeight: guide.device().statusBarHeight });
    /* 开屏：静态欢迎图（无动画），停留 2.4s 后直接移除。
       只在冷启动后首次进首页显示一次（切 tab 的 reLaunch 不重播）。 */
    const app = getApp();
    if (!app.splashPlayed) {
      app.splashPlayed = true;
      this.splashTimer = setTimeout(() => {
        this.splashTimer = null;
        this.setData({ splashVisible: false });
        this.showPetBubble();
      }, 2400);
    } else {
      this.setData({ splashVisible: false });
      this.showPetBubble();
    }
  },

  /** 萌宠气泡：开屏结束后展示 3s 淡出（不移除节点，只透明）。
      文案：本次启动首次 = 固定问候语，之后每次随机换一条猫语。 */
  showPetBubble() {
    const text = this.petGreeted ? tips.pickPetLine(this.data.petBubbleText) : tips.PET_GREETING;
    this.petGreeted = true;
    if (this.petBubbleTimer) { clearTimeout(this.petBubbleTimer); this.petBubbleTimer = null; }
    this.setData({ petBubble: true, petBubbleText: text });
    this.petBubbleTimer = setTimeout(() => {
      this.petBubbleTimer = null;
      this.setData({ petBubble: false });
    }, 3000);
  },

  onShow() {
    /* 本机首次启动：自动开始引导第一步（本次启动只会自动触发一次）。
       开屏静态图显示期间先不启动，等开屏结束后再弹引导蒙层。
       注：主流程（1~3 步）收尾后不再回首页中转，「添加」引导改由
       用户第一次点开添加页时触发（见 guide.pendingAdd）。 */
    if (!guide.getStep() && !guide.hasSeen() && !guide.hasStarted()) {
      guide.markStarted();
      const startFirst = () => {
        guide.setStep(STEP.HOME_POOL);
        this.applyGuideView();
      };
      if (this.data.splashVisible) {
        this.guideDelayTimer = setTimeout(startFirst, 2500);
      } else {
        startFirst();
      }
      return;
    }
    /* 从其他页面切回首页：盲盒按钮状态置新（结果/滚动态一律回到待开始） */
    if (this.data.phase !== 'idle') this.resetPool();
    this.applyGuideView();
  },

  /** 喵条摘要：引导期隐藏（别抢奖池/记录按钮的高亮），平时常驻 */
  refreshPet() {
    const step = guide.getStep();
    const inGuide = (step === STEP.HOME_POOL || step === STEP.HOME_RESULT);
    this.setData({ pet: inGuide ? null : pet.summary() });
  },

  /** 等级泡 → 喵屋 */
  goPet() {
    wx.navigateTo({ url: '/pages/pet/pet' });
  },

  /** IP 萌宠：点小猫 → 换一句猫语再聊 3s */
  onPetTap() {
    if (wx.vibrateShort) { try { wx.vibrateShort({ type: 'light' }); } catch (e) { /* ignore */ } }
    this.showPetBubble();
  },

  onHide() {
    this.clearTimers();
  },

  onUnload() {
    this.clearTimers();
  },

  clearTimers() {
    if (this.rollTimer) { clearInterval(this.rollTimer); this.rollTimer = null; }
    if (this.stopTimer) { clearTimeout(this.stopTimer); this.stopTimer = null; }
    if (this.guideDelayTimer) { clearTimeout(this.guideDelayTimer); this.guideDelayTimer = null; }
    if (this.splashTimer) { clearTimeout(this.splashTimer); this.splashTimer = null; }
    if (this.petBubbleTimer) { clearTimeout(this.petBubbleTimer); this.petBubbleTimer = null; }
  },

  /* ================= 开奖 ================= */

  onMode(e) {
    if (this.data.phase === 'rolling') return;
    this.setData({ mode: e.currentTarget.dataset.mode }, () => this.resetPool());
  },

  onPoolTap() {
    if (this.data.phase === 'idle') this.startDraw();
  },

  onToggle() {
    if (this.data.phase === 'rolling') this.stopDraw();
    else this.startDraw();
  },

  startDraw() {
    const step = guide.getStep();
    const inGuide = (step === STEP.HOME_POOL || step === STEP.HOME_RESULT);

    let list;
    if (inGuide) {
      list = DEMO_ROLL;
    } else {
      const mine = this.data.mode === 'mine';
      const dishes = store.getDishes(mine ? 'mine' : 'nearby');
      if (!dishes.length) {
        /* 菜单为空：提示 → 跳菜单页对应 tab（此时是空状态，带＋按钮） */
        wx.showToast({ title: '去丰富你的专属菜单吧', icon: 'none' });
        wx.reLaunch({ url: '/pages/menu/menu?tab=' + (mine ? 'mine' : 'nearby') });
        return;
      }
      list = dishes.map(function (d) { return d.name; });
    }

    /* 点【开始】= 第一步进入第二步：高亮从【开始】换到记录按钮 */
    if (step === STEP.HOME_POOL) {
      guide.setStep(STEP.HOME_RESULT);
      this.applyGuideView();
    }

    this.setData({
      phase: 'rolling',
      dishName: IDLE_NAME,
      recLabel: '我的饮食手札'
    });

    let i = 0;
    this.rollTimer = setInterval(() => {
      this.setData({ dishName: list[i % list.length] });
      i += 1;
    }, 80);
    this.stopTimer = setTimeout(() => this.stopDraw(), 3000);
  },

  stopDraw() {
    if (this.data.phase !== 'rolling') return;
    if (this.rollTimer) { clearInterval(this.rollTimer); this.rollTimer = null; }
    if (this.stopTimer) { clearTimeout(this.stopTimer); this.stopTimer = null; }

    const step = guide.getStep();
    const inGuide = (step === STEP.HOME_POOL || step === STEP.HOME_RESULT);
    let name;
    if (inGuide) {
      name = DEMO_ROLL[DEMO_ROLL.length - 1];          /* 引导期固定在番茄炒蛋 */
    } else {
      const dishes = store.getDishes(this.data.mode === 'mine' ? 'mine' : 'nearby');
      const d = dishes[Math.floor(Math.random() * dishes.length)];
      name = d ? d.name : IDLE_NAME;
    }

    this.setData({
      phase: 'result',
      dishName: name,
      recLabel: '☑️ 就它吧，记入今日饮食'
    }, () => {
      /* 引导第一步：结果开出后，高亮才从奖池/开始切到【记入今日饮食】 */
      if (guide.getStep() === STEP.HOME_POOL) {
        guide.setStep(STEP.HOME_RESULT);
        this.applyGuideView();
      }
    });
  },

  /** 盘上菜名对应的菜品对象（带图片 / 标签）——
      之前只传了 name，导致今日饮食卡片拿不到 image 而落成占位图 */
  resolveDrawnDish(type, fallbackName) {
    const name = this.data.dishName || fallbackName || '';
    const hit = store.getDishes(type).filter(function (d) { return d.name === name; })[0];
    return hit || { name: name };
  },

  /** 记录：有结果就写入今日饮食，然后去「我的」 */
  onRecord() {
    const step = guide.getStep();
    if (step === STEP.HOME_RESULT) {
      /* 第二步 → 第三步 */
      store.addRecord(this.resolveDrawnDish('mine', '番茄炒蛋'), store.defaultSlot());
      guide.setStep(STEP.PROFILE_DIET);
      wx.reLaunch({ url: '/pages/profile/profile' });
      return;
    }
    if (this.data.phase === 'result') {
      store.addRecord(this.resolveDrawnDish(this.data.mode === 'mine' ? 'mine' : 'nearby'), store.defaultSlot());
      wx.showToast({ title: '已记入今日饮食', icon: 'none' });
      /* 升级轻提示由「我的」页承载：本函数结尾必然 reLaunch 过去 */
      this.refreshPet();
      this.resetPool();
    }
    wx.reLaunch({ url: '/pages/profile/profile' });
  },

  resetPool() {
    if (this.rollTimer) { clearInterval(this.rollTimer); this.rollTimer = null; }
    if (this.stopTimer) { clearTimeout(this.stopTimer); this.stopTimer = null; }
    this.setData({
      phase: 'idle',
      dishName: IDLE_NAME,
      recLabel: '我的饮食手札'
    });
  },

  /* ================= 引导 ================= */

  applyGuideView() {
    const step = guide.getStep();
    const g = guide.baseState();
    g.step = step;

    if (step === STEP.HOME_POOL || step === STEP.HOME_RESULT) {
      g.skip = true;
      g.skipTop = this.data.statusBarHeight + 44;
      g.halo = true;
      g.rip = true;
      g.ring = true;
      g.poolGlow = true;
      g.liftPool = true;
      if (step === STEP.HOME_POOL) {
        g.liftDraw = true; g.glowDraw = true;
        g.hand = 'down';
        g.hint = '不知道吃什么，来转一下试试～';
      } else {
        g.liftRec = true; g.glowRec = true;
        g.hand = 'up';
      }
    }

    this.setData({ g: g }, () => {
      if (step === STEP.HOME_POOL || step === STEP.HOME_RESULT) this.layoutGuide();
      this.refreshPet();   // 引导期隐藏 Lv 泡，引导结束恢复
    });
  },

  layoutGuide() {
    const step = guide.getStep();
    const px = guide.px;
    const HALO_PAD = px(26);
    const RING_PAD = px(6);
    const off = guide.tipOffset(step === STEP.HOME_POOL);

    guide.measureAll(['#pool', '#btn-draw', '#btn-record']).then((res) => {
      const pool = res[0];
      const b = step === STEP.HOME_POOL ? res[1] : res[2];
      if (!pool || !b || guide.getStep() !== step) return;

      const cx = b.left + b.width / 2;
      const tipY = step === STEP.HOME_POOL ? (b.top - px(2)) : (b.top + b.height - px(6));
      const ringR = b.height / 2 + RING_PAD;

      this.setData({
        'g.haloStyle': 'left:' + (pool.left - HALO_PAD) + 'px;top:' + (pool.top - HALO_PAD) +
          'px;width:' + (pool.width + HALO_PAD * 2) + 'px;height:' + (pool.height + HALO_PAD * 2) + 'px;',
        'g.ringStyle': 'left:' + (b.left - RING_PAD) + 'px;top:' + (b.top - RING_PAD) +
          'px;width:' + (b.width + RING_PAD * 2) + 'px;height:' + (b.height + RING_PAD * 2) +
          'px;border-radius:' + ringR + 'px;',
        'g.handStyle': 'left:' + (cx - off.dx) + 'px;top:' + (tipY - off.dy) + 'px;',
        'g.ripStyle': 'left:' + (cx - px(23)) + 'px;top:' + (tipY - px(23)) + 'px;',
        'g.hintStyle': 'top:' + (b.top + b.height + px(84)) + 'px;'
      });
    });
  },

  onGuideMaskTap() {
    this.guideSkip();
  },

  onGuideSkip() {
    this.guideSkip();
  },

  onGuideHintBtn() {
    /* 首页气泡没有内嵌按钮 */
  },

  guideSkip() {
    const step = guide.getStep();
    if (step !== STEP.HOME_POOL && step !== STEP.HOME_RESULT) return;
    guide.setStep(0);
    guide.markStarted();
    this.resetPool();
    this.applyGuideView();
    /* 跳过主流程：置「添加」待触发标记，等用户第一次自己点开添加页 */
    guide.setPendingAdd(true);
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
