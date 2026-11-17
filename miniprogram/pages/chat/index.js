const store = require('../../utils/store');
const { go, requireAuth, toast } = require('../../utils/nav');
const { creditLevel, formatDate } = require('../../utils/catalog');
const { pickupOptions } = require('../../utils/campus');
const { appointmentTime, dateValue } = require('../../utils/pickup');

const pickupStates = {
  confirmed: '已确认',
  declined: '未达成',
  cancelled: '已取消'
};

const buyerShortcuts = [
  { label: '问成色', text: '你好，能说一下使用痕迹和配件情况吗？' },
  { label: '问价格', text: '你好，这件闲置还能便宜一点吗？' },
  { label: '约交接', text: '你好，你哪天方便在校内当面交接？' }
];
const sellerShortcuts = [
  { label: '回复成色', text: '你好，具体使用情况写在商品详情里。面交时也可以先检查。' },
  { label: '约交接', text: '你好，你哪天方便来取？我可以提前准备好。' }
];

function orderState(product, order) {
  if (order) {
    if (order.status === 'completed') return { label: '已完成', tone: 'complete' };
    if (order.status === 'aftersale') return order.afterSale && order.afterSale.reviewedAt
      ? { label: '已退款', tone: 'quiet' } : { label: '售后中', tone: 'alert' };
    return order.handoffAt ? { label: '待确认收货', tone: 'complete' } : { label: '待面交', tone: 'alert' };
  }
  if (!product) return null;
  if (product.status === 'active') return { label: '未下单', tone: 'live' };
  return { label: product.status === 'sold' ? '已售出' : '已下架', tone: 'quiet' };
}

function timeValue(date) {
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${hour}:${minute}`;
}

Page({
  data: {
    threadReady: false, peer: null, user: null, product: null, role: 'buyer', input: '', hasText: false,
    messages: [], scrollTo: '', showEmoji: false, keyboardHeight: 0,
    waitingPickup: false, handoffDone: false, canBook: false, canBuy: false, orderId: '', dealLabel: '',
    agreedPrice: null, tradePrice: null, tradeState: null, canHandoff: false, canSimulateReceipt: false,
    pickup: null, pickupState: null, pickupExpired: false, effectivePickup: null,
    canRespond: false, bookingOpen: false, earliestDate: '', bookingDate: '', bookingTime: '', pickupSites: [], pickupSiteIndex: 0, shortcuts: buyerShortcuts,
    emojis: ['😊', '👍', '🙌', '🌸', '👌', '🤝', '🎉', '📚', '❤️', '😄', '🙏', '✨']
  },

  onLoad(options) {
    this.threadId = options.id;
    this.openBookingOnShow = options.mode === 'pickup';
    this.returnToCheckout = options.return === 'checkout';
    this.draft = '';
  },

  onShow() {
    this.visible = true;
    this.setData({ keyboardHeight: 0, reducedMotion: Boolean(wx.getStorageSync('tcj:reduce-motion')) });
    const user = store.getUser();
    if (!user || !user.verified) {
      this.setData({ user: null, threadReady: false, messages: [] });
      return;
    }
    const thread = store.getThread(this.threadId);
    if (!thread) {
      this.setData({ user, threadReady: false, messages: [] });
      return;
    }
    const role = thread.role || (thread.sellerId === user.id ? 'seller' : 'buyer');
    const peerId = thread.peerId || (role === 'seller' ? thread.buyerId : thread.sellerId);
    const peer = store.getSeller(peerId);
    this.setData({
      user,
      threadReady: true,
      role,
      peer,
      creditLabel: peer ? creditLevel(peer.credit) : '',
      shortcuts: role === 'seller' ? sellerShortcuts : buyerShortcuts
    });
    this.refresh(thread, true);
    if (this.openBookingOnShow) {
      this.openBookingOnShow = false;
      this.openBooking();
    }
  },

  onHide() {
    this.visible = false;
    this.stopPolling();
    if (this.data.bookingOpen) this.setData({ bookingOpen: false });
  },
  onUnload() { this.onHide(); },

  stopPolling() {
    clearTimeout(this.poll);
  },

  refresh(thread = store.getThread(this.threadId), initial = false) {
    this.stopPolling();
    if (!thread) return;
    if (thread.unread) store.readThread(thread.id);
    const order = store.getOrderForThread(thread.id);
    const waitingPickup = Boolean(order && order.status === 'pending');
    const handoffDone = Boolean(waitingPickup && order.handoffAt);
    const sellerView = this.data.role === 'seller';
    const product = store.getProduct(thread.productId) || (order && order.product) || null;
    const canTrade = Boolean(product && product.status === 'active' && !order);
    const canBuy = canTrade && !sellerView;
    const canBook = Boolean(product && (canTrade || (waitingPickup && !handoffDone)) && pickupOptions(product.campusId).length);
    const deal = thread.deal;
    const agreedPrice = canTrade && deal && deal.basePrice === product.price && deal.price < product.price ? deal.price : null;
    const tradePrice = order && order.product ? order.product.price : agreedPrice ?? (product && product.price);
    const pickup = thread.pickup || null;
    const canRespond = Boolean(canBook && pickup && pickup.status === (sellerView ? 'proposed' : 'counter'));
    const pickupState = pickup && (pickupStates[pickup.status] || (canRespond
      ? (sellerView ? '买家发来预约' : '卖家建议改期') : '等待对方确认'));
    const expiresIn = canBook && pickup && ['confirmed', 'proposed', 'counter'].includes(pickup.status)
      ? appointmentTime(pickup.date, pickup.time) - Date.now() : NaN;
    const pickupExpired = expiresIn <= 0;
    const existing = order && order.pickup;
    const effectivePickup = canBook && existing && pickup && existing.id !== pickup.id &&
      appointmentTime(existing.date, existing.time) > Date.now() ? existing : null;
    const changed = initial || thread.messages.length !== this.data.messages.length ||
      (pickup && pickup.updatedAt) !== (this.data.pickup && this.data.pickup.updatedAt) ||
      (pickup && pickup.status) !== (this.data.pickup && this.data.pickup.status);
    const updates = {
      product, tradePrice, tradeState: orderState(product, order),
      waitingPickup, handoffDone, canBuy, canBook, canRespond, canHandoff: sellerView && waitingPickup && !handoffDone,
      canSimulateReceipt: sellerView && handoffDone,
      orderId: order ? order.id : '',
      dealLabel: order ? '查看订单' : this.returnToCheckout ? '返回结算' : agreedPrice === null ? '去下单' : `按 ¥${agreedPrice} 下单`,
      agreedPrice, pickup, pickupState, pickupExpired, effectivePickup
    };
    if (changed) {
      updates.messages = thread.messages.map((message, index, history) => ({
        id: message.id,
        from: message.from,
        text: message.text || '自提地点',
        time: index === 0 || message.createdAt - history[index - 1].createdAt >= 300000 ? formatDate(message.createdAt) : ''
      }));
    }
    this.setData(updates, changed ? () => this.keepLatest() : undefined);
    // 只有待处理的回复才会触发轮询，等待本人的邀请留给当前用户处理。
    const awaitingReply = (thread.replies && thread.replies.length) || (pickup && pickup.responseAt);
    const nextCheck = Math.min(awaitingReply ? 850 : Infinity, expiresIn > 0 ? expiresIn : Infinity);
    if (this.visible && Number.isFinite(nextCheck)) {
      this.poll = setTimeout(() => this.refresh(), Math.min(nextCheck, 2147483647));
    }
  },

  keepLatest() {
    this.setData({ scrollTo: '' }, () => this.setData({ scrollTo: 'chat-bottom' }));
  },

  authenticate() {
    requireAuth(`/pages/chat/index?id=${this.threadId}`);
  },

  updateInput(event) {
    // Keep the native input and its cursor in control while typing, including during IME composition.
    this.draft = event.detail.value;
    const hasText = Boolean(this.draft.trim());
    if (hasText !== this.data.hasText) this.setData({ hasText });
  },

  focusInput(event) {
    const height = Number(event.detail.height) || 0;
    this.setData({ showEmoji: false, keyboardHeight: height || this.data.keyboardHeight }, () => this.keepLatest());
  },

  blurInput() {
    if (this.data.keyboardHeight) this.setData({ keyboardHeight: 0 }, () => this.keepLatest());
  },

  resizeForKeyboard(event) {
    const height = Math.max(0, Number(event.detail.height) || 0);
    if (this.visible && height !== this.data.keyboardHeight) {
      this.setData({ keyboardHeight: height }, () => this.keepLatest());
    }
  },

  toggleEmoji() {
    if (this.data.keyboardHeight) wx.hideKeyboard();
    this.setData({ showEmoji: !this.data.showEmoji }, () => this.keepLatest());
  },

  addEmoji(event) {
    const next = `${this.draft}${event.currentTarget.dataset.emoji}`;
    if (next.length > 500) {
      toast('消息最多 500 字');
      return;
    }
    this.draft = next;
    this.setData({ input: next, hasText: true });
  },

  send(event) {
    const value = event && event.detail && event.detail.value;
    const input = typeof value === 'string' ? value : this.draft;
    const text = input.trim();
    if (!text || !requireAuth(`/pages/chat/index?id=${this.threadId}`)) return;
    try {
      store.sendChat(this.threadId, text);
      this.clearInput(input);
      this.refresh();
    } catch (error) {
      toast(error.message);
    }
  },

  useShortcut(event) {
    const text = event.currentTarget.dataset.text;
    if (!text) return;
    if (this.draft.trim()) {
      toast('先发送或清空正在输入的消息');
      return;
    }
    this.draft = text;
    this.setData({ input: text, hasText: true, showEmoji: false });
  },

  openBooking() {
    if (!this.data.canBook) return;
    if (this.data.keyboardHeight) wx.hideKeyboard();
    const { pickup, product } = this.data;
    const now = new Date(Date.now());
    const suggested = new Date(Math.ceil((now.getTime() + 30 * 60000) / (15 * 60000)) * 15 * 60000);
    if (suggested.getHours() >= 22) suggested.setDate(suggested.getDate() + 1);
    if (suggested.getHours() >= 22 || suggested.getHours() < 8) suggested.setHours(8, 30, 0, 0);
    const usePlanned = pickup && appointmentTime(pickup.date, pickup.time) > now.getTime();
    const pickupSites = pickupOptions(product.campusId);
    const preferredSite = usePlanned ? pickup.location : product.location;
    this.setData({
      bookingOpen: true, showEmoji: false, pickupSites, pickupSiteIndex: Math.max(0, pickupSites.indexOf(preferredSite)),
      earliestDate: dateValue(now), bookingDate: usePlanned ? pickup.date : dateValue(suggested),
      bookingTime: usePlanned ? pickup.time : timeValue(suggested)
    });
  },

  closeBooking() { this.setData({ bookingOpen: false }); },
  stopBookingTap() {},
  selectLocation(event) { this.setData({ pickupSiteIndex: Number(event.detail.value) }); },
  selectDate(event) { this.setData({ bookingDate: event.detail.value }); },
  selectTime(event) { this.setData({ bookingTime: event.detail.value }); },

  submitBooking() {
    const { bookingDate: date, bookingTime: time, pickupSites, pickupSiteIndex } = this.data;
    const location = pickupSites[pickupSiteIndex];
    if (!(appointmentTime(date, time) > Date.now())) return toast('请选择晚于现在的面交时间');
    try {
      store.proposePickup(this.threadId, { location, date, time });
      this.closeBooking();
      this.refresh();
      toast('已发出面交邀请');
    } catch (error) {
      toast(error.message);
    }
  },

  respondBooking(event) {
    const { choice, id } = event.currentTarget.dataset;
    try {
      store.respondPickup(this.threadId, choice, id);
      this.refresh();
      toast(choice === 'accept' ? '已确认面交' : '已拒绝此方案');
    } catch (error) {
      this.refresh();
      toast(error.message);
    }
  },

  cancelBooking() {
    const { pickup } = this.data;
    if (!pickup) return;
    wx.showModal({
      title: '取消面交预约？',
      content: '可以在会话里重新发起预约。',
      confirmText: '取消预约',
      cancelText: '保留预约',
      confirmColor: '#B8336A',
      success: ({ confirm }) => {
        if (!confirm) return;
        try {
          store.cancelPickup(this.threadId, pickup.id);
          this.refresh();
          toast('已取消预约');
        } catch (error) {
          this.refresh();
          toast(error.message);
        }
      }
    });
  },

  openDeal() {
    const { orderId, canBuy, product } = this.data;
    if (this.data.role === 'seller') return;
    if (orderId) go(`/pages/order/index?id=${encodeURIComponent(orderId)}`);
    else if (canBuy) {
      const url = `/pages/checkout/index?id=${encodeURIComponent(product.id)}&threadId=${encodeURIComponent(this.threadId)}`;
      const stack = getCurrentPages();
      const previous = stack[stack.length - 2];
      if (this.returnToCheckout && previous && previous.route === 'pages/checkout/index') {
        wx.navigateBack({ fail: () => go(url, 'replace') });
      } else {
        go(url);
      }
    }
  },

  handoff() {
    const { canHandoff, orderId } = this.data;
    if (!canHandoff || !orderId) return;
    wx.showModal({
      title: '确认已当面交付？',
      content: '确认后，会提醒买家在订单里确认收货。',
      confirmText: '确认交付',
      confirmColor: '#B8336A',
      success: ({ confirm }) => {
        if (!confirm) return;
        try {
          store.markOrderHandoff(orderId);
          this.refresh();
          toast('已记录交付');
        } catch (error) {
          this.refresh();
          toast(error.message);
        }
      }
    });
  },

  simulateReceipt() {
    const { canSimulateReceipt, orderId } = this.data;
    if (!canSimulateReceipt || !orderId) return;
    wx.showModal({
      title: '模拟买家确认收货？',
      content: '收货后订单将标为已完成。',
      confirmText: '模拟收货',
      confirmColor: '#B8336A',
      success: ({ confirm }) => {
        if (!confirm) return;
        try {
          store.simulateBuyerReceipt(orderId);
          this.refresh();
          toast('交易已完成');
        } catch (error) {
          this.refresh();
          toast(error.message);
        }
      }
    });
  },

  clearInput(value) {
    this.draft = '';
    // Pass the native value through the bound field before clearing it, even if data.input already equals ''.
    this.setData({ input: value, showEmoji: false, hasText: false }, () => {
      if (!this.draft) this.setData({ input: '' });
    });
  },

  openProduct() {
    const { product } = this.data;
    if (product) go(`/pages/detail/index?id=${product.id}`);
  }
});
