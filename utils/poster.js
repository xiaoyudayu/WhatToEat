/**
 * 分享长图绘制（T1 · canvas 2d）
 * 纸底 = 备菜清单纸三切片（与弹框同一份素材：top 定高 + mid 纵向平铺 + bottom 定高），
 * 内容按 prep.build() 的视图数据绘制；交叉备菜口径：不排钟点。
 * 产出临时文件路径 → 页面预览 → 用户保存到相册。
 *
 * 用法（页面内）：
 *   poster.render(this, prepData, { mode: 'serial' | 'cross' })
 *     .then((tempFilePath) => ...)
 */
const W = 750;                 // 设计稿宽度（canvas 像素宽）
const TOP_H = 235;             // 纸顶段高
const MID_H = 128;             // 纸中段高（平铺单元）
const BOT_H = 330;             // 纸底段高
const X0 = 68, X1 = 682;       // 内容安全区（避开毛边与虚线框）
const CW = X1 - X0;
const MAX_H = 4000;            // canvas 高度上限

const IMG = {
  top: '/assets/images/ip/prep-note-top.png',
  mid: '/assets/images/ip/prep-note-mid.png',
  bottom: '/assets/images/ip/prep-note-bottom.png',
  paw: '/assets/images/ip/share-paw.png',
  qr: '/assets/images/ip/poster-qrcode.png'
};

const C = {
  ink: '#3D2A1E',
  ink2: '#8A7666',
  ink3: '#BBA896',
  primary: '#E2622F',
  line: '#EBDBC9',
  paper: '#F6ECD9',
  stepBg: 'rgba(255,255,255,0.72)',
  chipBg: 'rgba(255,255,255,0.8)',
  tagBg: 'rgba(250,224,204,0.9)'
};

function font(size, bold) {
  return (bold ? 'bold ' : '') + size + 'px "PingFang SC","Helvetica Neue",sans-serif';
}
function songFont(size, bold) {
  return (bold ? 'bold ' : '') + size + 'px "Songti SC","Noto Serif SC",serif';
}

/** 逐字换行（中英文混排安全） */
function wrapText(ctx, text, maxWidth) {
  const lines = [];
  let line = '';
  const t = String(text || '');
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (line && ctx.measureText(line + ch).width > maxWidth) {
      lines.push(line);
      line = ch;
    } else {
      line += ch;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function loadImage(canvas, src) {
  return new Promise(function (resolve, reject) {
    const img = canvas.createImage();
    img.onload = function () { resolve(img); };
    img.onerror = function () { reject(new Error('img fail: ' + src)); };
    img.src = src;
  });
}

/** 本地包内图片；SVG / 空 → null（canvas 不支持 SVG，调用方画占位块） */
function loadDishImage(canvas, src) {
  if (!src || /\.svg$/i.test(src)) return Promise.resolve(null);
  return loadImage(canvas, src).catch(function () { return null; });
}

/**
 * 绘制长图并导出临时文件
 * @param {Page} page 页面实例（含 #poster-canvas 节点）
 * @param {Object} data prep.build() 的返回
 * @param {Object} opts { mode: 'serial'|'cross' }
 * @returns {Promise<string>} 临时文件路径
 */
function render(page, data, opts) {
  const mode = (opts && opts.mode) === 'cross' ? 'cross' : 'serial';

  return new Promise(function (resolve, reject) {
    const query = page ? wx.createSelectorQuery().in(page) : wx.createSelectorQuery();
    query.select('#poster-canvas').fields({ node: true }).exec(function (res) {
      if (!res || !res[0] || !res[0].node) {
        reject(new Error('canvas 节点不存在'));
        return;
      }
      draw(res[0].node, data, mode).then(resolve, reject);
    });
  });
}

function draw(canvas, data, mode) {
  const ctx = canvas.getContext('2d');

  /* ---- 第一遍：测量（用 ctx.measureText 布局，得到总高） ---- */
  ctx.font = font(24);
  const L = layout(ctx, data, mode);
  const H = Math.min(L.height + BOT_H, MAX_H);

  /* ---- 画布尺寸 ---- */
  canvas.width = W;
  canvas.height = H;

  /* ---- 载入素材 ---- */
  const dishes = data.serial || [];
  const tasks = [
    loadImage(canvas, IMG.top),
    loadImage(canvas, IMG.mid),
    loadImage(canvas, IMG.bottom),
    loadImage(canvas, IMG.paw),
    loadImage(canvas, IMG.qr)
  ].concat(dishes.map(function (d) { return loadDishImage(canvas, d.image); }));

  return Promise.all(tasks.map(function (p) { return p.catch(function () { return null; }); }))
    .then(function (imgs) {
      const imTop = imgs[0], imMid = imgs[1], imBot = imgs[2], imPaw = imgs[3], imQr = imgs[4];
      const dishImgs = imgs.slice(5);

      /* ---- 纸底：top + mid 平铺 + bottom ---- */
      ctx.clearRect(0, 0, W, H);
      if (imTop) ctx.drawImage(imTop, 0, 0, W, TOP_H);
      if (imMid) {
        let y = TOP_H;
        while (y < H - BOT_H) {
          ctx.drawImage(imMid, 0, y, W, MID_H);
          y += MID_H;
        }
      }
      if (imBot) ctx.drawImage(imBot, 0, H - BOT_H, W, BOT_H);

      /* ---- 内容 ---- */
      paint(ctx, L, H, { imPaw: imPaw, imQr: imQr, dishImgs: dishImgs });

      /* ---- 导出 ---- */
      return new Promise(function (resolve, reject) {
        wx.canvasToTempFilePath({
          canvas: canvas,
          x: 0, y: 0, width: W, height: H,
          destWidth: W, destHeight: H,
          fileType: 'png',
          success: function (r) { resolve(r.tempFilePath); },
          fail: reject
        });
      });
    });
}

/* ================= 布局：逐块记录绘制参数 ================= */

function layout(ctx, data, mode) {
  const items = [];
  let y = TOP_H + 64;

  function text(t, x, yy, f, color, align, lh) {
    items.push({ t: 'text', text: t, x: x, y: yy, font: f, color: color, align: align || 'left' });
    if (lh) y += lh;
    return yy;
  }

  /* 标题 */
  ctx.font = songFont(46, true);
  y = text('备菜清单', W / 2, y, null, C.ink, 'center');
  y += 18;
  const modeName = mode === 'cross' ? '建议交叉备菜顺序' : '一道一道做';
  ctx.font = font(24);
  y = text(data.count + ' 道菜 · ' + modeName + ' · 约 ' + data.totalMinutes + ' 分钟',
    W / 2, y, null, C.ink2, 'center');
  y += 56;

  /* 标签行（左标题 + 右小注） */
  function label(t, small) {
    ctx.font = font(26, true);
    y = text(t, X0, y, null, C.ink2);
    ctx.font = font(20);
    items.push({ t: 'text', text: small, x: X1, y: y, font: null, color: C.ink3, align: 'right', fontCfg: font(20) });
    y += 44;
  }

  /* 食材 chips（流式） */
  label('食材合计', data.ingredients.length + ' 样 · 合并去重');
  ctx.font = font(22);
  let cx = X0, rowH = 0;
  data.ingredients.forEach(function (ing) {
    const txt = ing.name + (ing.times > 1 ? ' ×' + ing.times : '');
    const w = ctx.measureText(txt).width + 36;
    if (cx + w > X1) { cx = X0; y += rowH + 12; rowH = 0; }
    items.push({ t: 'chip', text: txt, x: cx, y: y, w: w });
    rowH = Math.max(rowH, 48);
    cx += w + 12;
  });
  y += rowH + 52;

  /* 步骤区 */
  if (mode === 'serial') {
    label('一道一道做', '按菜品展开 · 依次做完');
    data.serial.forEach(function (d) {
      /* 菜组头：菜名 + meta */
      ctx.font = font(30, true);
      y = text(d.name, X0, y, null, C.ink);
      ctx.font = font(20);
      items.push({ t: 'text', text: d.minutes + ' 分钟 · ' + d.steps.length + ' 个步骤',
        x: X0, y: y + 4, font: null, color: C.ink3, fontCfg: font(20) });
      y += 40;

      d.steps.forEach(function (s, i) {
        ctx.font = font(24);
        const lines = wrapText(ctx, s.text, CW - 108);
        const boxH = Math.max(64, lines.length * 34 + 26);
        items.push({ t: 'step', no: i + 1, lines: lines, tag: s.tag, x: X0, y: y, h: boxH });
        y += boxH + 12;
      });
      y += 26;
    });
  } else {
    label('交叉备菜顺序', '同一时刻可并行');
    y = text('按「备料 → 炖煮 → 看火 → 出锅」归并，同一时刻能并行的排在一起',
      X0, y, null, C.ink3, 'left');
    y += 28;
    data.cross.forEach(function (f, i) {
      ctx.font = font(24);
      const lines = wrapText(ctx, f.dish + ' · ' + f.text, CW - 108);
      const boxH = Math.max(64, lines.length * 34 + 26);
      items.push({ t: 'step', no: i + 1, lines: lines, tag: f.tag, wait: f.wait, x: X0, y: y, h: boxH });
      y += boxH + 12;
    });
    y += 26;
  }

  /* 本餐菜品 */
  label('本餐菜品', data.count + ' 道');
  data.serial.forEach(function (d, i) {
    items.push({ t: 'dish', name: d.name, img: 'dish' + i, x: X0, y: y });
    y += 112;
  });
  y += 30;

  /* 底部品牌区 */
  items.push({ t: 'foot', y: y, paw: 'paw', qr: 'qr' });
  const footH = 210;

  return { items: items, height: y + footH };
}

/* ================= 绘制 ================= */

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function paint(ctx, L, H, res) {
  const imgMap = {};
  res.dishImgs.forEach(function (im, i) { imgMap['dish' + i] = im; });
  imgMap['paw'] = res.imPaw;
  imgMap['qr'] = res.imQr;

  L.items.forEach(function (it) {
    if (it.t === 'text') {
      ctx.font = it.font || font(24);
      ctx.fillStyle = it.color;
      ctx.textAlign = it.align || 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(it.text, it.x, it.y);
    } else if (it.t === 'chip') {
      ctx.fillStyle = C.chipBg;
      ctx.strokeStyle = C.line;
      ctx.lineWidth = 2;
      roundRect(ctx, it.x, it.y, it.w, 48, 24);
      ctx.fill();
      ctx.stroke();
      ctx.font = font(22);
      ctx.fillStyle = C.ink;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(it.text, it.x + 18, it.y + 25);
    } else if (it.t === 'step') {
      /* 步骤行卡片 */
      ctx.fillStyle = it.wait ? 'rgba(255,255,255,0.35)' : C.stepBg;
      ctx.strokeStyle = C.line;
      ctx.lineWidth = 2;
      if (it.wait) ctx.setLineDash([8, 8]);
      roundRect(ctx, it.x, it.y, CW, it.h, 20);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      /* 序号 */
      ctx.beginPath();
      ctx.arc(it.x + 44, it.y + it.h / 2, 20, 0, Math.PI * 2);
      ctx.fillStyle = C.tagBg;
      ctx.fill();
      ctx.font = font(20, true);
      ctx.fillStyle = C.primary;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(it.no), it.x + 44, it.y + it.h / 2 + 1);
      /* 文本 */
      ctx.font = font(24);
      ctx.fillStyle = it.wait ? C.ink2 : C.ink;
      ctx.textAlign = 'left';
      const tx = it.x + 82;
      let ty = it.y + it.h / 2 - ((it.lines.length - 1) * 34) / 2;
      it.lines.forEach(function (ln) {
        ctx.fillText(ln, tx, ty);
        ty += 34;
      });
      /* 工序标签 */
      if (it.tag) {
        ctx.font = font(20);
        const tw = ctx.measureText(it.tag).width + 28;
        ctx.fillStyle = C.tagBg;
        roundRect(ctx, X0 + CW - tw - 20, it.y + it.h / 2 - 22, tw, 44, 22);
        ctx.fill();
        ctx.fillStyle = C.primary;
        ctx.textAlign = 'center';
        ctx.fillText(it.tag, X0 + CW - tw / 2 - 20, it.y + it.h / 2 + 1);
      }
    } else if (it.t === 'dish') {
      /* 菜品行：缩略图 + 名称 */
      const im = imgMap[it.img];
      if (im) {
        ctx.save();
        roundRect(ctx, it.x, it.y, 96, 96, 22);
        ctx.clip();
        ctx.drawImage(im, it.x, it.y, 96, 96);
        ctx.restore();
      } else {
        ctx.fillStyle = C.tagBg;
        roundRect(ctx, it.x, it.y, 96, 96, 22);
        ctx.fill();
      }
      ctx.strokeStyle = C.line;
      ctx.lineWidth = 2;
      roundRect(ctx, it.x, it.y, 96, 96, 22);
      ctx.stroke();
      ctx.font = font(28, true);
      ctx.fillStyle = C.ink;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(it.name, it.x + 118, it.y + 50);
    } else if (it.t === 'foot') {
      /* 品牌区：爪徽 + 品牌名 + 二维码 */
      const fx = W / 2;
      let fy = it.y;
      if (imgMap['paw']) {
        ctx.beginPath();
        ctx.arc(fx, fy + 30, 42, 0, Math.PI * 2);
        ctx.fillStyle = C.primary;
        ctx.fill();
        /* 爪图按比例居中放进圆内 */
        const pw = 44, ph = 44 * (imgMap['paw'].height / imgMap['paw'].width);
        ctx.drawImage(imgMap['paw'], fx - pw / 2, fy + 30 - ph / 2, pw, ph);
      }
      fy += 92;
      ctx.font = songFont(30, true);
      ctx.fillStyle = C.ink;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText('今天吃什么', fx, fy);
      fy += 36;
      if (imgMap['qr']) {
        ctx.drawImage(imgMap['qr'], fx - 60, fy, 120, 120);
      } else {
        /* 棋盘格占位 */
        for (let i = 0; i < 6; i++) {
          for (let j = 0; j < 6; j++) {
            ctx.fillStyle = (i + j) % 2 ? '#ffffff' : C.ink;
            ctx.fillRect(fx - 60 + i * 20, fy + j * 20, 20, 20);
          }
        }
      }
      fy += 138;
      ctx.font = font(18);
      ctx.fillStyle = C.ink3;
      ctx.fillText('长按识别小程序码 · 来看看今天吃什么', fx, fy);
    }
  });
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

module.exports = {
  render: render
};
