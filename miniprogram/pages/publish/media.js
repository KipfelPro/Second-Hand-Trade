function imageDigest(fs, filePath) {
  if (typeof fs.getFileInfo !== 'function') return Promise.resolve('')
  return new Promise(resolve => fs.getFileInfo({
    filePath,
    digestAlgorithm: 'sha256',
    success({ digest }) {
      resolve(/^[a-f0-9]{64}$/i.test(digest) ? digest.toLowerCase() : '')
    },
    fail() { resolve('') }
  }))
}

function selectImages(count) {
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      async success(result) {
        const fs = wx.getFileSystemManager()
        const saved = []
        const temporaryCopies = []
        try {
          const paths = result.tempFiles.map(file => file.tempFilePath)
          const digests = await Promise.all(paths.map(path => imageDigest(fs, path)))
          for (let index = 0; index < paths.length; index++) {
            const path = paths[index]
            const digest = digests[index]
            const extension = /\.[a-z0-9]+$/i.exec(path)
            // 同一张照片复用持久路径，草稿和上架表单都可识别重复照片。
            const filename = digest
              ? 'tcj-photo-' + digest + (extension ? extension[0].toLowerCase() : '.jpg')
              : 'tcj-' + Date.now() + '-' + index + '-' + Math.random().toString(36).slice(2, 8) + (extension ? extension[0] : '.jpg')
            const destination = wx.env.USER_DATA_PATH + '/' + filename
            let exists = false
            if (digest && typeof fs.accessSync === 'function') {
              try { fs.accessSync(destination); exists = true } catch (error) { /* Copy below. */ }
            }
            if (!exists) {
              fs.copyFileSync(path, destination)
              if (!digest) temporaryCopies.push(destination)
            }
            saved.push(destination)
          }
          resolve([...new Set(saved)])
        } catch (error) {
          temporaryCopies.forEach(filePath => fs.unlink({ filePath }))
          reject(error)
        }
      },
      fail: reject
    })
  })
}

function previewImage(event) {
  const { path, images } = event.currentTarget.dataset
  wx.previewImage({ current: path, urls: images })
}

function mockVoice(content, onConfirm) {
  wx.showModal({
    title: '棠小助 · 模拟语音转写',
    editable: true,
    content,
    placeholderText: '可修改模拟识别的文字',
    confirmText: '使用文字',
    success(result) {
      const text = (typeof result.content === 'string' ? result.content : content).trim()
      if (result.confirm && text) onConfirm(text)
    }
  })
}

let recorder
let voiceRequest

function getRecorder() {
  if (recorder) return recorder
  recorder = wx.getRecorderManager()
  recorder.onStop(() => finishVoice())
  recorder.onError(() => finishVoice(true))
  return recorder
}

function finishVoice(useFallback) {
  if (!voiceRequest) return
  const { page, content, onConfirm, cancelled } = voiceRequest
  voiceRequest = null
  if (cancelled) return
  page.setData({ recording: false })
  if (useFallback) wx.showToast({ title: '麦克风不可用，使用模拟文字', icon: 'none' })
  mockVoice(content, onConfirm)
}

function toggleVoice(page, content, onConfirm) {
  if (voiceRequest && voiceRequest.page === page) {
    if (!voiceRequest.cancelled) getRecorder().stop()
    return
  }
  if (voiceRequest) return
  try {
    const manager = getRecorder()
    voiceRequest = { page, content, onConfirm }
    page.setData({ recording: true })
    // Audio stays on the device. This prototype supplies a sample transcript for editing.
    manager.start({ duration: 15000, sampleRate: 16000, numberOfChannels: 1, format: 'mp3' })
  } catch (error) {
    if (voiceRequest) finishVoice(true)
    else mockVoice(content, onConfirm)
  }
}

function cancelVoice(page) {
  if (!voiceRequest || voiceRequest.page !== page || voiceRequest.cancelled) return
  voiceRequest.cancelled = true
  page.setData({ recording: false })
  try { getRecorder().stop() } catch (error) { voiceRequest = null }
}

function readBatch() {
  return wx.getStorageSync('tcj:batch-drafts') || []
}

function writeBatch(drafts) {
  wx.setStorageSync('tcj:batch-drafts', drafts)
}

function availableSamples(images, userId, drafts = readBatch()) {
  const occupied = new Set(drafts.flatMap(draft => draft.images))
  if (userId) {
    const { getProducts } = require('../../utils/store')
    getProducts().filter(product => product.sellerId === userId && product.status === 'active').forEach(product => {
      product.images.forEach(path => occupied.add(path))
    })
  }
  return images.filter(path => !occupied.has(path))
}

module.exports = { selectImages, previewImage, toggleVoice, cancelVoice, readBatch, writeBatch, availableSamples }
