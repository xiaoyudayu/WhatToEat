/**
 * 本地数据层：菜品 / 饮食记录
 * 数据持久化在 wx storage。
 * 重要：新用户首进**菜单为空**（原型评审稿：「已去掉全部默认数据」），
 * 所以这里不写任何默认菜品，只把缺失 / 结构不对的存储值兜底成空数组。
 * 示例数据见文件末尾 seedDemo()，仅供控制台调试。
 */
/* v3：换 key 并丢弃 v1 / v2 旧数据。
   v2 存过一批「演示菜品」种子，会把新用户菜单又变成有数据，
   所以启动时直接删掉旧 key，让老缓存自动失效（无需手动清缓存）。 */
const DISH_KEY = 'eatwhat_dishes_v3';
const RECORD_KEY = 'eatwhat_records_v3';
const LEGACY_KEYS = [
  'eatwhat_dishes_v1', 'eatwhat_records_v1', 'eatwhat_selected_v1',
  'eatwhat_dishes_v2', 'eatwhat_records_v2'
];

const pet = require('./pet');

const SLOTS = ['早', '午', '晚', '夜宵'];

/** 无图菜品占位插画（与原型 PH 一致：盘 + 菜叶 + 肉块 + 热气） */
const PLACEHOLDER = '/assets/images/dish-placeholder.svg';

/** 调试用示例数据（原型调试面板的「载入演示数据」，正式版无入口） */
const DEMO_DISHES = [
  {
    id: 'd1', name: '番茄炒蛋', type: 'mine', tags: ['酸甜', '下饭'], minutes: 15,
    image: '/assets/images/dish-tomato-egg.png', ingredients: ['鸡蛋', '番茄', '葱花'],
    steps: [
      { text: '热锅下油，炒散鸡蛋', minutes: 5 },
      { text: '下番茄翻炒，调味出锅', minutes: 2 }
    ]
  },
  {
    id: 'd2', name: '红烧肉', type: 'mine', tags: ['硬菜', '咸鲜'], minutes: 45,
    image: '/assets/images/dish-pork.png', ingredients: ['五花肉', '冰糖', '生抽'],
    steps: [
      { text: '焯水切块，炒糖色', minutes: 10 },
      { text: '小火慢炖收汁', minutes: 30 }
    ]
  },
  {
    id: 'd3', name: '清炒时蔬', type: 'mine', tags: ['清淡', '快手'], minutes: 10,
    image: '/assets/images/dish-greens.png', ingredients: ['时蔬', '蒜'],
    steps: [{ text: '热锅下油，爆香蒜末下菜快炒', minutes: 3 }]
  },
  {
    id: 'd4', name: '清炒时蔬', type: 'nearby', tags: ['素食', '粤菜'], distance: '450m', price: 28,
    image: '/assets/images/dish-greens-nearby.png'
  },
  {
    id: 'd5', name: '番茄炒蛋', type: 'nearby', tags: ['川菜', '香辣'], distance: '0.8km', price: 32,
    image: '/assets/images/dish-tomato-egg-nearby.png'
  }
];

const NEARBY_BUCKETS = ['全部', '500m内', '1km内', '3km内'];

/** 标签候选：需求 4.5 支持点击添加（口味 / 菜系 / 其他） */
const TAG_PRESETS = {
  口味: ['酸甜', '清淡', '香辣', '咸鲜', '麻辣', '苦'],
  菜系: ['川菜', '粤菜', '淮扬菜', '北方菜', '湘菜', '鲁菜'],
  其他: ['下饭', '硬菜', '素食', '快手']
};

function read(key, fallback) {
  try {
    const v = wx.getStorageSync(key);
    return v === '' || v === null || v === undefined ? fallback : v;
  } catch (e) {
    return fallback;
  }
}

function write(key, value) {
  try {
    wx.setStorageSync(key, value);
  } catch (e) {
    /* ignore */
  }
}

function clearLegacy() {
  LEGACY_KEYS.forEach(function (k) {
    try {
      wx.removeStorageSync(k);
    } catch (e) {
      /* ignore */
    }
  });
}

function init() {
  clearLegacy();

  /* 菜品：缺失 / 不是数组 → 兜底成空数组（新用户菜单为空，不写默认数据） */
  if (!Array.isArray(read(DISH_KEY, null))) write(DISH_KEY, []);

  /* 记录：缺失或结构不对则清空 */
  if (!Array.isArray(read(RECORD_KEY, null))) write(RECORD_KEY, []);
}

/** 载入示例数据（仅调试：控制台执行 store.seedDemo()） */
function seedDemo() {
  write(DISH_KEY, DEMO_DISHES.slice());
  return DEMO_DISHES.length;
}

/** 清空本地数据（菜品清空 + 今日饮食清空 + 喵条账本归零，回到新用户状态；我的页长按标题 / 调试用） */
function resetAll() {
  [DISH_KEY, RECORD_KEY].forEach(function (k) {
    try {
      wx.removeStorageSync(k);
    } catch (e) {
      /* ignore */
    }
  });
  pet.reset();
  init();
}

function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

function todayKey() {
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

const WEEK = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

module.exports = {
  SLOTS: SLOTS,
  TAG_PRESETS: TAG_PRESETS,
  PLACEHOLDER: PLACEHOLDER,
  init: init,
  resetAll: resetAll,
  seedDemo: seedDemo,
  todayKey: todayKey,

  /** 头部胶囊日期文案 */
  todayLabel() {
    const d = new Date();
    return {
      date: d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日',
      week: WEEK[d.getDay()],
      clock: pad(d.getHours()) + ':' + pad(d.getMinutes())
    };
  },

  /* ---------------- 菜品 ---------------- */

  getDishes(type) {
    const all = read(DISH_KEY, []);
    return type ? all.filter(function (d) { return d.type === type; }) : all;
  },

  getDish(id) {
    return read(DISH_KEY, []).filter(function (d) { return d.id === id; })[0] || null;
  },

  saveDish(dish) {
    const all = read(DISH_KEY, []);
    if (dish.id) {
      const i = all.findIndex(function (d) { return d.id === dish.id; });
      if (i > -1) all[i] = Object.assign({}, all[i], dish);
      else all.push(dish);
    } else {
      dish.id = 'd' + Date.now();
      all.push(dish);
    }
    write(DISH_KEY, all);
    return dish;
  },

  removeDish(id) {
    write(DISH_KEY, read(DISH_KEY, []).filter(function (d) { return d.id !== id; }));
  },

  /** 分类：我的菜单取标签去重，附近美食取距离区间 */
  getCategories(type) {
    if (type === 'nearby') return NEARBY_BUCKETS.slice();
    const tags = [];
    this.getDishes('mine').forEach(function (d) {
      (d.tags || []).forEach(function (t) {
        if (tags.indexOf(t) < 0) tags.push(t);
      });
    });
    tags.sort(function (a, b) { return a.localeCompare(b, 'zh'); });
    return ['全部'].concat(tags);
  },

  /** 按分类过滤；cat 为空或「全部」返回该类型全部 */
  getList(type, cat) {
    const dishes = this.getDishes(type);
    if (!cat || cat === '全部') return dishes;
    if (type === 'nearby') {
      const limit = { '500m内': 500, '1km内': 1000, '3km内': 3000 };
      const max = limit[cat];
      if (!max) return dishes;
      return dishes.filter(function (d) {
        const m = parseFloat(d.distance);
        const meters = (d.distance || '').indexOf('km') > -1 ? m * 1000 : m;
        return !isNaN(meters) && meters <= max;
      });
    }
    return dishes.filter(function (d) { return (d.tags || []).indexOf(cat) > -1; });
  },

  /** 关键词搜索（菜名 / 标签） */
  search(type, keyword) {
    const kw = (keyword || '').trim();
    if (!kw) return [];
    return this.getDishes(type).filter(function (d) {
      if ((d.name || '').indexOf(kw) > -1) return true;
      return (d.tags || []).some(function (t) { return t.indexOf(kw) > -1; });
    });
  },

  /* ---------------- 今日饮食 ---------------- */

  defaultSlot() {
    const h = new Date().getHours();
    if (h < 10) return '早';
    if (h < 15) return '午';
    if (h < 21) return '晚';
    return '夜宵';
  },

  getTodayRecords() {
    const today = todayKey();
    return read(RECORD_KEY, []).filter(function (r) { return r.date === today; });
  },

  /** 按 早/午/晚/夜宵 分组，保证四个 key 都在 */
  getRecordsBySlot() {
    const out = {};
    SLOTS.forEach(function (s) { out[s] = []; });
    this.getTodayRecords().forEach(function (r) {
      if (!out[r.slot]) out[r.slot] = [];
      out[r.slot].push(r);
    });
    return out;
  },

  addRecord(dish, slot) {
    const all = read(RECORD_KEY, []);
    all.push({
      rid: 'r' + Date.now(),
      date: todayKey(),
      slot: slot || this.defaultSlot(),
      time: new Date().toTimeString().slice(0, 5),
      dishId: dish.id || '',
      name: dish.name || '',
      image: dish.image || '',
      tags: dish.tags || [],
      /* 喵条口径依据：'mine' 自己做（+10）/ 'nearby' 出去吃（不计）。
         落到记录上，账本就能脱离菜品表独立判断（菜品可能后来被删）。 */
      type: (dish && dish.type) || 'mine'
    });
    write(RECORD_KEY, all);
    /* 喵条账本双写：与记录同函数落库，保证不漏记、不重记 */
    pet.addForDish(dish);
  },

  removeRecord(rid) {
    write(RECORD_KEY, read(RECORD_KEY, []).filter(function (r) { return r.rid !== rid; }));
    /* 只增不减口径：删记录不回退喵条（pet.onRecordRemoved 为显式空操作） */
    pet.onRecordRemoved();
  },

  /** 今日饮食构成：按记录菜品标签粗分四类（需求文档：算法待定，此处为粗略统计） */
  getTodayStats() {
    const recs = this.getTodayRecords();
    const dishes = this.getDishes();
    const hit = { 蔬菜: 0, 主食: 0, 蛋白质: 0, 水果: 0 };
    const map = {
      清淡: '蔬菜', 素食: '蔬菜', 快手: '蔬菜',
      下饭: '主食',
      酸甜: '水果',
      硬菜: '蛋白质', 川菜: '蛋白质', 香辣: '蛋白质', 麻辣: '蛋白质', 咸鲜: '蛋白质'
    };
    recs.forEach(function (r) {
      const dish = dishes.filter(function (d) { return d.id === r.dishId; })[0];
      const tags = dish ? (dish.tags || []) : (r.tags || []);
      tags.forEach(function (t) {
        const k = map[t];
        if (k) hit[k] += 1;
      });
    });
    const total = Object.keys(hit).reduce(function (s, k) { return s + hit[k]; }, 0);
    return ['蔬菜', '主食', '蛋白质', '水果'].map(function (k) {
      return { label: k, percent: total ? Math.round((hit[k] / total) * 100) : 0 };
    });
  }
};
