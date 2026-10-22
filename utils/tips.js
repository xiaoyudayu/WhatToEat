/**
 * 喵语贴士库 + 时段逻辑（与原型 ip-pet.html 同步）
 * 正式词条库准备好后，整体替换 CAT_TIPS / WEATHER_TIPS 两个常量即可。
 */

/* IP 猫按时段换装：早餐 5-10 / 午餐 10-15 / 晚餐 15-19 / 夜宵 19-5 */
function timeBucket(h) {
  if (h >= 5 && h < 10) return 'breakfast';
  if (h >= 10 && h < 15) return 'lunch';
  if (h >= 15 && h < 19) return 'dinner';
  return 'supper';
}

const BUCKET_META = {
  breakfast: { tag: '晨间贴士', glow: 'rgba(255,205,112,.22)' },
  lunch:     { tag: '午间贴士', glow: 'rgba(255,196,77,.18)' },
  dinner:    { tag: '傍晚贴士', glow: 'rgba(255,122,64,.22)' },
  supper:    { tag: '深夜贴士', glow: 'rgba(128,143,222,.20)' }
};

/* 喵语贴士库：季节 × 时段 × 3 条（演示版） */
const CAT_TIPS = {
  spring: {
    breakfast: ['喵呜～春晨微凉，喝碗热粥暖暖胃呀', '春困来袭，早餐加个蛋才有力气喵', '春天的荠菜最鲜，喵想尝一口'],
    lunch: ['春光正好，午饭清淡点下午不困喵', '春天时令菜最多，绿叶菜换着吃喵', '晒着太阳吃饭，喵陪你慢慢吃'],
    dinner: ['春夜微凉，晚饭记得添碗热汤喵', '晚饭后来个蒸梨，清清爽爽喵', '傍晚风大，晚餐清淡少海鲜哦喵'],
    supper: ['春天夜宵浅尝就好，早点歇喵～', '夜里凉，喝口温水再睡喵', '早睡早起，喵先去打个盹']
  },
  summer: {
    breakfast: ['趁早晨凉快，快把早餐吃掉喵', '天热没胃口？绿豆粥喵也爱喝', '早餐加点酸，番茄黄瓜最清爽喵'],
    lunch: ['正午太阳毒，记得多补水喵～', '夏天午饭要清淡，油腻留给冬天喵', '苦瓜冬瓜正当时，吃了不闷热喵'],
    dinner: ['傍晚雷雨多，在家吃晚饭最妙喵', '烧烤虽香，一周一次刚刚好喵', '冬瓜汤一碗，清清爽爽喵'],
    supper: ['夜宵别贪凉，冰的吃多肚子抗议喵', '夏夜小酌？浅浅一点就好喵', '空调别开太低，喵怕冷']
  },
  autumn: {
    breakfast: ['秋天的银耳粥，暖呼呼来一碗喵', '热豆浆配包子，秋晨标配喵', '秋天胃口开，早餐也别撑喵'],
    lunch: ['贴秋膘要适度，荤素三七开喵', '午饭后来个苹果，清清爽爽喵', '南瓜山药正当季，秋天多吃喵'],
    dinner: ['秋夜渐凉，萝卜汤暖身喵', '吃蟹正当时，记得配姜茶喵', '嗓子干干的？蒸梨安排喵'],
    supper: ['夜宵换成热牛奶，睡得更香喵', '秋夜长，睡前一杯温水喵', '夜里转凉，凉拌的就不要啦喵']
  },
  winter: {
    breakfast: ['冬天起床难，先喝口热粥喵', '热乎早餐要吃饱，出门不抖喵', '别空腹出门，会冷到打喷嚏喵'],
    lunch: ['热炖菜安排，喵的尾巴都暖了', '萝卜白菜家常菜，比什么都实在喵', '正午难得暖，饭后晒晒太阳喵'],
    dinner: ['天黑得早，回家吃热乎的喵', '火锅别只涮肉，青菜也要喵', '羊汤一碗，寒风退散喵'],
    supper: ['冬夜漫长，夜宵七分饱就好喵', '睡前泡脚加温水，喵陪你睡', '别熬夜啦，猫咪都早睡喵']
  }
};

/* 雨 / 雪天专属喵语（命中天气时覆盖常规贴士） */
const WEATHER_TIPS = {
  rain: { breakfast: '雨天路滑，热粥暖胃再出门喵', lunch: '下雨天，午饭来点热乎的最舒服喵', dinner: '雨夜最适合一碗热汤面喵', supper: '听着雨声，夜宵少吃一点喵' },
  snow: { breakfast: '下雪啦！热腾腾的早餐安排喵', lunch: '雪天吃点炖菜，暖乎乎喵', dinner: '雪夜火锅最配，青菜别忘喵', supper: '雪夜冷，热牛奶再睡喵' }
};

/* 首页 IP 萌宠气泡词条：简短、轻松、拟人化的日常猫语。
   首屏固定用 PET_GREETING，之后随机（点小猫 / 回首页）换一条。 */
const PET_GREETING = '嗨，今天想吃什么，来转转看吧~';

const PET_LINES = [
  '嗨，今天想吃什么，来转转看吧~',
  '喵～肚子饿了没？转一转，看看今天吃什么',
  '今天也要好好吃饭呀，我陪你挑',
  '唔…突然有点想吃热乎的，你呢？',
  '别纠结啦，交给转盘决定吧',
  '菜单里的菜都在等你呢，喵呜～',
  '吃饭是一天里最开心的事喵',
  '想吃辣的还是清淡的？我猜你心里有数啦',
  '点点我，今天的好食欲就归你了',
  '慢慢来，好吃的值得等一等喵',
  '一顿好吃的，能把一整天都变甜',
  '我在这儿呢，随时陪你挑菜',
  '今天想吃点什么好的？转起来～',
  '天转凉了，来点热乎乎的吧？',
  '喵在想，你昨天是不是也在这儿偷看菜单',
  '吃饱饱，才有力气做喜欢的事呀'
];

/** 随机取一条猫语（传入上一条可避免连着重复） */
function pickPetLine(exclude) {
  if (PET_LINES.length < 2) return PET_LINES[0];
  let line = PET_LINES[Math.floor(Math.random() * PET_LINES.length)];
  let guard = 0;
  while (line === exclude && guard < 8) {
    line = PET_LINES[Math.floor(Math.random() * PET_LINES.length)];
    guard += 1;
  }
  return line;
}

function seasonOf(m) {
  return m >= 3 && m <= 5 ? 'spring' : m >= 6 && m <= 8 ? 'summer' : m >= 9 && m <= 11 ? 'autumn' : 'winter';
}

const SEASON_NAME = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };
const BUCKET_SHORT = { breakfast: '早晨', lunch: '午后', dinner: '傍晚', supper: '深夜' };

/** 「我的」页头部信息块。
    原先展示天气，但那是按日期轮换的演示数据（无数据源），
    精确到「湿度 / 风力」属于内容不实 —— 改为只用可核验的真实信息（时段 + 月份季节）。
    接入真实天气 API 后，把返回值换回 { temp:'24', desc:'晴', feels:'体感 26°', extra:'湿度 58%…' } 即可复用原版式。 */
function heroInfo(now, bucket) {
  const m = now.getMonth() + 1;
  return {
    temp: BUCKET_SHORT[bucket] || '今天',
    desc: m + '月 · ' + (SEASON_NAME[seasonOf(m)] || ''),
    extra: '按季节与时段为你挑贴士'
  };
}

/* 天气 key 与文案（预留：当前未展示天气，接入真实天气 API 后再启用 weatherKey） */
const WEATHER_DEMO = [
  { key: 'clear',    desc: '晴',   temp: '24', feels: '体感 26°', extra: '湿度 58% · 东南风 2 级' },
  { key: 'overcast', desc: '多云', temp: '21', feels: '体感 22°', extra: '湿度 64% · 北风 3 级' },
  { key: 'rain',     desc: '小雨', temp: '18', feels: '体感 17°', extra: '湿度 82% · 东风 2 级' }
];

function pickTip(now, bucket, weatherKey) {
  if (weatherKey === 'rain' || weatherKey === 'snow') return WEATHER_TIPS[weatherKey][bucket];
  const pool = CAT_TIPS[seasonOf(now.getMonth() + 1)][bucket];
  return pool[(now.getDate() + now.getHours()) % pool.length];
}

/* 时段首访看板的已读标记：当天 + 时段 */
function tipBoardKey(bucket) {
  const n = new Date();
  return 'eatwhat_tipboard_v2_' + n.getFullYear() + '-' + (n.getMonth() + 1) + '-' + n.getDate() + '_' + bucket;
}

module.exports = { timeBucket, BUCKET_META, CAT_TIPS, WEATHER_TIPS, WEATHER_DEMO, PET_GREETING, PET_LINES, seasonOf, heroInfo, pickPetLine, pickTip, tipBoardKey };
