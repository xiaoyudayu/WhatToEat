const store = require('./utils/store');
const guide = require('./utils/guide');

/* 品牌标题字体：站酷快乐体 ZCOOL KuaiLe Regular（SIL OFL 1.1，免费商用）。
   字体已子集化（190 字）并 base64 内联在 app.wxss 末尾的 BRAND FONT 区块，
   不走网络 —— 开发者工具 / iOS / Android 真机表现一致，也不会产生网络报错。
   新增文案缺字时：重跑 make-font-subset.py 再跑 make-brand-font-wxss.js。 */
const FONT_FAMILY = 'ZCOOL KuaiLe';

/* 远程字体通道（可选，默认关闭）：
   字体已内联，正常无需联网取字。若后续想在原生组件（如 input 输入框）上也用
   站酷快乐体，就把这里改成 true —— 但必须先把下面的 CDN 域名加到
   微信公众平台「downloadFile 合法域名」，否则真机会加载失败（工具里可能不报）。*/
const USE_REMOTE_FONT = false;
const FONT_URL = 'https://81e36fa9b47b4af49808b922f39ffcca.app.workbuddy.host/ZCOOLKuaiLe-subset.ttf';

App({
  globalData: {
    statusBarHeight: 44,
    windowWidth: 375,
    windowHeight: 812,
    /* 字体就绪标记：已内联，渲染即可用，恒为 true。
       保留这个字段是为了兼容既有调用（若有页面据此判断）。 */
    fontReady: true
  },

  onLaunch() {
    store.init();

    try {
      const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      this.globalData.statusBarHeight = info.statusBarHeight || 44;
      this.globalData.windowWidth = info.windowWidth || 375;
      this.globalData.windowHeight = info.windowHeight || 812;
    } catch (e) {
      /* 兜底用默认值 */
    }
    guide.init();

    if (USE_REMOTE_FONT) this.loadBrandFont();
  },

  /* 远程加载站酷快乐体（可选通道，默认不调用）。
     注意：不要和 scopes:['native'] 混用 data URL / 本地路径，真机常直接失败，
     还会把整次调用带挂；这里用的是公网 https，失败即静默回退系统字体。 */
  loadBrandFont() {
    if (!wx.loadFontFace) return;
    wx.loadFontFace({
      global: true,
      family: FONT_FAMILY,
      source: 'url("' + FONT_URL + '")',
      scopes: ['webview', 'native'],
      success: () => {
        console.log('[font] 远程站酷快乐体加载成功');
      },
      fail: (err) => {
        /* 字体已内联，这里失败不影响显示，只记一行日志便于排查 */
        console.warn('[font] 远程字体未加载（不影响显示）：', err && err.errMsg);
      }
    });
  }
});
