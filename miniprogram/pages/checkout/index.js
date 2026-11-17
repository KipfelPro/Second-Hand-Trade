const store = require('../../utils/store');
const { go, requireAuth, toast } = require('../../utils/nav');
const { appointmentTime } = require('../../utils/pickup');

Page({
  data: { product: null, purchasePrice: 0, negotiated: false, available: false, busy: false, paidOrderId: '', pickup: null, pickupPending: false },

  onLoad(options) {
    this.productId = options.id;
    this.threadId = options.threadId || '';
  },

  onShow() {
    clearTimeout(this.pickupExpiry);
    const product = store.getProduct(this.productId);
    const user = store.getUser();
    const incoming = this.threadId && store.getThread(this.threadId);
    const thread = incoming && incoming.productId === this.productId
      ? incoming
      : store.getThreadForProduct(this.productId);
    const appointment = thread && thread.pickup;
    const until = appointment ? appointmentTime(appointment.date, appointment.time) - Date.now() : NaN;
    const relevant = Boolean(appointment && ['proposed', 'counter', 'confirmed'].includes(appointment.status));
    const proposal = relevant && until > 0 ? appointment : null;
    const activeThreadId = thread ? thread.id : '';
    const purchasePrice = product ? store.getCheckoutPrice(product.id, activeThreadId || undefined) : 0;
    this.setData({
      product: product || null,
      activeThreadId,
      purchasePrice,
      negotiated: Boolean(product && purchasePrice !== product.price),
      pickup: proposal && proposal.status === 'confirmed' ? proposal : null,
      pickupPending: Boolean(proposal && proposal.status === 'proposed'),
      pickupCountered: Boolean(proposal && proposal.status === 'counter'),
      pickupExpired: relevant && until <= 0,
      reducedMotion: Boolean(wx.getStorageSync('tcj:reduce-motion')),
      available: Boolean(product && product.status === 'active' && (!user || product.sellerId !== user.id))
    });
    if (proposal) this.pickupExpiry = setTimeout(() => this.onShow(), Math.min(until, 2147483647));
  },

  onHide() { clearTimeout(this.pickupExpiry); },
  onUnload() { this.onHide(); },

  submit() {
    const { product, activeThreadId, available, busy, paidOrderId, pickup } = this.data;
    if (paidOrderId) {
      this.viewOrder();
      return;
    }
    if (busy || !available || !requireAuth(this.route())) return;
    if (pickup && appointmentTime(pickup.date, pickup.time) <= Date.now()) {
      this.onShow();
      toast('自提预约已过期，请核对后再提交');
      return;
    }

    const threadId = activeThreadId || undefined;
    const amount = store.getCheckoutPrice(this.productId, threadId);
    if (!Number.isFinite(amount)) {
      this.onShow();
      toast('暂时无法读取商品金额');
      return;
    }
    this.setData({ busy: true, purchasePrice: amount, negotiated: amount !== product.price });
    wx.showModal({
      title: '确认模拟支付',
      content: `¥${amount} 仅用于托管演示。本次不会实际扣款。`,
      confirmText: '确认支付',
      confirmColor: '#B8336A',
      success: ({ confirm }) => {
        if (!confirm) return;
        try {
          if (pickup && appointmentTime(pickup.date, pickup.time) <= Date.now()) {
            this.onShow();
            toast('自提预约已过期，请核对后再提交');
            return;
          }
          if (store.getCheckoutPrice(this.productId, threadId) !== amount) {
            this.onShow();
            toast('成交价已更新，请重新核对金额');
            return;
          }
          // 本地仓库同步提交，防止连续点击或重复购买同一件闲置。
          const order = store.placeOrder(this.productId, threadId, amount);
          this.setData({ paidOrderId: order.id || order, available: false });
          toast('模拟支付成功');
          this.viewOrder();
        } catch (error) {
          toast(error.message);
          this.onShow();
        }
      },
      complete: () => this.setData({ busy: false })
    });
  },

  route() {
    const suffix = this.threadId ? `&threadId=${encodeURIComponent(this.threadId)}` : '';
    return `/pages/checkout/index?id=${this.productId}${suffix}`;
  },

  arrangePickup() {
    const { product, available, busy, pickup, pickupPending, pickupCountered } = this.data;
    if (!available || busy || !requireAuth(this.route())) return;
    try {
      const thread = store.openThread(product.sellerId, product.id);
      const mode = pickup || pickupPending || pickupCountered ? '' : '&mode=pickup';
      go(`/pages/chat/index?id=${encodeURIComponent(thread.id)}&return=checkout${mode}`);
    } catch (error) {
      toast(error.message || '暂时无法打开预约');
    }
  },

  viewOrder() {
    wx.redirectTo({
      url: `/pages/order/index?id=${this.data.paidOrderId}&paid=1`,
      fail: () => toast('打开订单失败，请点击查看订单')
    });
  }
});
