const store = require('../../utils/store');
const { go, requireAuth, toast } = require('../../utils/nav');
const { formatDate } = require('../../utils/catalog');
const { appointmentTime } = require('../../utils/pickup');

const states = {
  pending: { title: '待收货', text: '先和卖家约时间，验货后确认收货。', funds: '平台托管中' },
  completed: { title: '已完成', funds: '已模拟划给卖家' },
  aftersale: { title: '平台介入', funds: '等待售后审核' },
  reviewed: { title: '售后已处理', funds: '已模拟退款' }
};

const transactionSteps = [
  { label: '款项托管', icon: 'wallet' },
  { label: '校园自提', icon: 'location' },
  { label: '面交验货', icon: 'box' },
  { label: '确认收货', icon: 'receipt' }
];
const afterSaleSteps = [
  transactionSteps[0],
  { label: '售后审核', icon: 'shield' },
  { label: '处理完成', icon: 'check' }
];

Page({
  data: { order: null, verified: false, dialog: '', reason: '', rating: 0, comment: '', stars: [1, 2, 3, 4, 5] },

  onLoad(options) {
    this.orderId = options.id;
    this.fromCheckout = options.paid === '1';
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const order = store.getOrder(this.orderId);
    const user = store.getUser();
    const verified = Boolean(user && user.verified);
    if (!order || !verified) {
      this.setData({ verified, order: null });
      return;
    }
    const reviewed = Boolean(order.afterSale && order.afterSale.reviewedAt);
    const seller = store.getSeller(order.sellerId);
    const pickup = order.pickup && order.pickup.status === 'confirmed' ? order.pickup : null;
    const handoffAt = order.handoffAt ? formatDate(order.handoffAt) : '';
    const pickupExpired = Boolean(order.status === 'pending' && !handoffAt && pickup &&
      appointmentTime(pickup.date, pickup.time) <= Date.now());
    const status = { ...states[reviewed ? 'reviewed' : order.status] };
    if (order.status === 'pending') {
      if (handoffAt) status.text = '已验货，请确认收货。';
      else if (pickupExpired) status.text = '预约已过期，可联系卖家改约。';
      else if (pickup) status.text = '按约自提，验货后确认收货。';
    }
    const paymentConfirmed = this.fromCheckout && order.status === 'pending';
    const celebrating = paymentConfirmed || order.status === 'completed' || reviewed;
    const steps = order.status === 'aftersale' ? afterSaleSteps : transactionSteps;
    const currentStep = order.status === 'aftersale' ? (reviewed ? 2 : 1)
      : order.status === 'completed' ? 3 : handoffAt ? 2 : 1;
    const timelineComplete = order.status === 'completed' || reviewed;
    this.setData({
      verified,
      order,
      pickup,
      pickupExpired,
      handoffAt,
      status,
      reducedMotion: Boolean(wx.getStorageSync('tcj:reduce-motion')),
      paymentConfirmed,
      celebrating,
      steps,
      currentStep,
      timelineComplete,
      showActions: order.status === 'pending' || (order.status === 'completed' && !order.rating) ||
        (order.status === 'aftersale' && !reviewed),
      sellerName: seller ? (seller.nickname || seller.name) : '校园卖家',
      orderedAt: formatDate(order.createdAt),
      completedAt: order.completedAt ? formatDate(order.completedAt) : '',
      appliedAt: order.afterSale ? formatDate(order.afterSale.createdAt) : '',
      reviewedAt: reviewed ? formatDate(order.afterSale.reviewedAt) : ''
    });
  },

  authenticate() {
    requireAuth(`/pages/order/index?id=${this.orderId}`);
  },

  openProduct() {
    const { order } = this.data;
    if (order) go(`/pages/detail/index?id=${order.productId}`);
  },

  contactSeller() {
    const { order } = this.data;
    if (!order || order.status !== 'pending') return;
    try {
      const thread = order.threadId ? store.getThread(order.threadId) : null;
      const id = (thread || store.openThread(order.sellerId, order.productId)).id;
      go(`/pages/chat/index?id=${encodeURIComponent(id)}&mode=pickup`);
    } catch (error) {
      toast(error.message || '暂时无法打开私聊');
    }
  },

  recordHandoff() {
    const { order, handoffAt } = this.data;
    if (!order || order.status !== 'pending' || handoffAt) return;
    wx.showModal({
      title: '模拟线下面交验货',
      content: '记录本次面交验货后，仍需点击确认收货才能完成交易。',
      confirmText: '记录验货',
      confirmColor: '#B8336A',
      success: ({ confirm }) => {
        if (!confirm) return;
        try {
          store.markOrderHandoff(this.orderId);
          this.refresh();
          toast('已记录面交验货');
        } catch (error) {
          toast(error.message);
        }
      }
    });
  },

  confirmReceipt() {
    wx.showModal({
      title: '确认已收到闲置？',
      content: '请在完成线下交接并检查商品后确认。托管款项将模拟划给卖家。',
      confirmText: '确认收货',
      confirmColor: '#B8336A',
      success: ({ confirm }) => {
        if (!confirm) return;
        try {
          store.confirmOrder(this.orderId);
          this.refresh();
          toast('已确认收货');
        } catch (error) {
          toast(error.message);
        }
      }
    });
  },

  startAfterSale() { this.setData({ dialog: 'aftersale', reason: '' }); },
  startRating() { this.setData({ dialog: 'rating', rating: 0, comment: '' }); },
  closeDialog() { this.setData({ dialog: '' }); },
  preventClose() {},
  updateReason(event) { this.setData({ reason: event.detail.value }); },
  selectStar(event) { this.setData({ rating: event.currentTarget.dataset.value }); },
  updateComment(event) { this.setData({ comment: event.detail.value }); },

  sendAfterSale() {
    try {
      store.openAfterSale(this.orderId, this.data.reason);
      this.closeDialog();
      this.refresh();
      toast('售后申请已提交');
    } catch (error) {
      toast(error.message);
    }
  },

  simulateReview() {
    wx.showModal({
      title: '模拟管理员审核',
      content: '演示中，平台会通过本次售后申请，将托管款项模拟原路退回。',
      confirmText: '模拟审核',
      confirmColor: '#B8336A',
      success: ({ confirm }) => {
        if (!confirm) return;
        try {
          store.reviewAfterSale(this.orderId);
          this.refresh();
          toast('模拟审核已完成');
        } catch (error) {
          toast(error.message);
        }
      }
    });
  },

  sendRating() {
    const { rating, comment } = this.data;
    try {
      store.rateOrder(this.orderId, { rating, comment });
      this.closeDialog();
      this.refresh();
      toast('交易评价已提交');
    } catch (error) {
      toast(error.message);
    }
  }
});
