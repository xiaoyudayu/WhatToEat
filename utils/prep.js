/**
 * 备菜清单数据组装（T1 · R30 定稿）
 * 弹框与分享长图共用同一份视图数据，保证两边内容一致。
 * 输入：已选菜品数组（store.getDish 的结构：name/image/minutes/ingredients/steps）
 * 输出：食材合计（跨菜合并去重）/ 一道一道做（按菜分组）/ 交叉备菜（按工序归类）
 */

/** 交叉备菜归并顺序：备料 → 炖煮 → 看火 → 出锅（长图口径：不排钟点） */
const TAG_RULES = [
  [/腌|切|洗|打散|备|剁|泡|解冻|调好|准备/, '备料'],
  [/炖|煮|蒸|焖|烤|焯/, '炖煮'],
  [/炒|煎|炸|爆|收汁|看火/, '看火'],
  [/出锅|装盘|上桌|摆盘/, '出锅']
];
const CROSS_ORDER = ['备料', '炖煮', '看火', '出锅', '其他'];

/** 步骤文本 → 工序归类 */
function tagOf(text) {
  const t = String(text || '');
  for (let i = 0; i < TAG_RULES.length; i++) {
    if (TAG_RULES[i][0].test(t)) return TAG_RULES[i][1];
  }
  return '其他';
}

/** 食材名去用量后缀，便于跨菜合并（「五花肉 500g」→「五花肉」） */
function ingName(raw) {
  const s = String(raw).replace(
    /[\s·]*[\d.]+\s*(g|kg|ml|l|克|千克|毫升|个|只|根|把|颗|勺|片|块|斤|盒|袋)?\s*$/i,
    ''
  ).trim();
  return s || String(raw);
}

/**
 * 组装备菜清单视图数据
 * @param {Array} dishes 已选菜品
 * @returns {{count,totalMinutes,stepCount,ingredients,serial,cross}}
 */
function build(dishes) {
  const ds = dishes || [];

  /* 食材合计：跨菜合并去重，重复出现的标次数 */
  const map = {};
  const order = [];
  ds.forEach(function (d) {
    (d.ingredients || []).forEach(function (raw) {
      const n = ingName(raw);
      if (map[n]) { map[n].times += 1; }
      else { map[n] = { name: n, times: 1 }; order.push(n); }
    });
  });
  const ingredients = order.map(function (n) { return map[n]; });

  /* 一道一道做：每道菜一组，步骤带工序标签，默认全展开 */
  const serial = ds.map(function (d) {
    return {
      id: d.id || d.name,
      name: d.name,
      image: d.image || '',
      minutes: d.minutes || 0,
      open: true,
      ings: (d.ingredients || []).slice(),
      steps: (d.steps || []).map(function (s) {
        return { text: s.text, tag: tagOf(s.text) };
      })
    };
  });

  /* 交叉备菜：全部步骤按工序归并；炖煮行标 wait（虚线弱化，提示需要等待） */
  const flat = [];
  ds.forEach(function (d) {
    (d.steps || []).forEach(function (s) {
      const tag = tagOf(s.text);
      flat.push({ dish: d.name, text: s.text, tag: tag, wait: tag === '炖煮' });
    });
  });
  flat.sort(function (a, b) {
    return CROSS_ORDER.indexOf(a.tag) - CROSS_ORDER.indexOf(b.tag);
  });

  return {
    count: ds.length,
    totalMinutes: ds.reduce(function (a, d) { return a + (d.minutes || 0); }, 0),
    stepCount: flat.length,
    ingredients: ingredients,
    serial: serial,
    cross: flat
  };
}

module.exports = {
  build: build,
  tagOf: tagOf,
  ingName: ingName
};
