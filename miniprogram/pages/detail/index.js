const store = require('../../utils/store');
const { go, requireAuth, toast } = require('../../utils/nav');
const { creditLevel, getCategory } = require('../../utils/catalog');
const { appointmentTime } = require('../../utils/pickup');

Page({
  data: { product: null, seller: null, slide: 0 },

  onLoad(options) {
    this.productId = options.id;
  },

  onShow() {
    const product = store.getProduct(this.productId);
    if (!product) {
      this.setData({ product: null });
      return;
    }
    if (store.latestProductId() !== product.id) store.rememberProduct(product.id);
    const current = store.getUser();
    const seller = store.getSeller(product.sellerId);
    const category = getCategory(product.category);
    const thread = current && current.verified ? store.getThreadForProduct(product.id) : null;
    const order = product.status === 'sold' && current && current.verified
      ? store.getOrders().find((item) => item.productId === product.id) : null;
    const appointment = thread && thread.pickup;
    const proposal = appointment && appointmentTime(appointment.date, appointment.time) > Date.now() ? appointment : null;
    const pickup = order ? order.pickup : proposal;
    this.setData({
      product,
      seller,
      bookedPickup: pickup && pickup.status === 'confirmed' ? pickup : null,
      showPickup: Boolean(proposal && ['proposed', 'counter', 'confirmed'].includes(proposal.status)),
      boughtOrderId: order ? order.id : '',
      reducedMotion: Boolean(wx.getStorageSync('tcj:reduce-motion')),
      categoryName: category ? (category.name || category.label || product.category) : product.category,
      creditLabel: seller ? creditLevel(seller.credit) : '',
      own: Boolean(current && current.id === product.sellerId),
      favorited: store.favoriteIds().includes(product.id)
    });
  },

  slideChange(event) {
    this.setData({ slide: event.detail.current });
  },

  preview(event) {
    const { product } = this.data;
    wx.previewImage({
      current: event.currentTarget.dataset.src,
      urls: product.images,
      fail: () => toast('暂时无法打开大图，可滑动查看商品图片')
    });
  },

  toggleFavorite() {
    const { product, favorited } = this.data;
    if (!requireAuth(`/pages/detail/index?id=${product.id}`)) return;
    try {
      store.toggleFavorite(product.id);
      this.setData({ favorited: store.favoriteIds().includes(product.id) });
      toast(favorited ? '已取消收藏' : '已加入收藏夹');
    } catch (error) {
      toast(error.message);
    }
  },

  chat(event) {
    const { product } = this.data;
    if (!requireAuth(`/pages/detail/index?id=${product.id}`)) return;
    try {
      const thread = store.openThread(product.sellerId, product.id);
      const pickupMode = event && event.currentTarget.dataset.pickup && !this.data.showPickup ? '&mode=pickup' : '';
      go(`/pages/chat/index?id=${encodeURIComponent(thread.id)}${pickupMode}`);
    } catch (error) {
      toast(error.message);
    }
  },

  checkout() {
    const { boughtOrderId } = this.data;
    const url = boughtOrderId ? `/pages/order/index?id=${encodeURIComponent(boughtOrderId)}` : `/pages/checkout/index?id=${this.productId}`;
    if (requireAuth(url)) go(url);
  },

  edit() {
    go(`/pages/publish/index?id=${this.productId}`);
  }
});
