Component({
  properties: {
    /** 当前页：home | menu | add | profile */
    active: { type: String, value: 'home' },
    /** 引导期需要抬到蒙层之上的 tab：'' | 'menu' | 'add' | 'mine' */
    lift: { type: String, value: '' }
  },

  methods: {
    onTap(e) {
      const url = e.currentTarget.dataset.url;
      if (!url) return;
      const pages = getCurrentPages();
      const cur = pages.length ? '/' + pages[pages.length - 1].route : '';
      if (url === cur) return;          /* 点当前页 = 什么都不做，避免打断引导 */
      wx.reLaunch({ url });
    }
  }
});
