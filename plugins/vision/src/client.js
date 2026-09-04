/**
 * vision-local 客户端 bundle（手写 __ModuleLoader__ 格式，免构建）。
 * 能力：拖拽图片到页面任意位置 / Cmd+V 粘贴截图 → 静默加入产品原生附件栏（草稿里
 * 显示缩略图）→ 用户按现有发送键发送 → 原生视觉模型直接接收图片；纯文本模型由
 * Host 适配器投影成 image_vision 注记，再由工具代看。
 * 零弹窗、零按钮、零路径文本：附件栏缩略图本身就是唯一反馈。
 */
window.__ModuleLoader__.load({
  id: '@deepseek-ai/dsh-vision-local',
  factory: (require) => {
    const React = require('react')

    const MAX_BYTES = 8 * 1024 * 1024
    const IMAGE_MIME = { 'image/png': true, 'image/jpeg': true, 'image/webp': true, 'image/gif': true }
    const MAX_FILES = 4

    // 页面级桥：root 级捕获层与 session 级输入框之间的共享状态（仅传递 inputActions）
    const store = {
      inputActions: null,
    }

    const validateFiles = (files) => {
      if (files.length === 0) return '没有图片文件'
      if (files.length > MAX_FILES) return '一次最多 ' + MAX_FILES + ' 张图片'
      for (const f of files) {
        if (!IMAGE_MIME[f.type]) return '仅支持 png/jpg/webp/gif：' + (f.name || '(未知文件)')
        if (f.size > MAX_BYTES) return '图片超过 8MB 上限：' + (f.name || '')
      }
      return null
    }

    return {
      name: 'vision-local',
      apply(ctx) {
        const slots = ctx.get('slots')
        if (slots === undefined) return

        // 把图片静默加进产品原生附件栏（草稿缩略图），复用现有发送键
        const stageIntoComposer = (fileList) => {
          const files = []
          for (let i = 0; i < fileList.length; i++) files.push(fileList[i])
          const problem = validateFiles(files)
          if (problem !== null) {
            console.error('[vision-local] 忽略无效图片：' + problem)
            return
          }
          const conversation = ctx.get('conversation')
          const actions = store.inputActions
          if (conversation === undefined || typeof conversation.createDraftImages !== 'function') return
          if (actions === null || typeof actions.addImages !== 'function') return
          try {
            const drafts = conversation.createDraftImages(files)
            if (!actions.addImages(drafts.map(draft => draft.id))) {
              if (typeof conversation.releaseDraftImages === 'function') conversation.releaseDraftImages(drafts)
            }
          } catch (err) {
            console.error('[vision-local] 添加附件失败：' + String(err && err.message ? err.message : err))
          }
        }

        // 1) root 级捕获层：拖放 + 剪贴板粘贴（永远不渲染任何 UI）
        function CaptureLayer() {
          React.useEffect(() => {
            const hasFiles = (event) => {
              const dt = event.dataTransfer
              return dt !== undefined && dt !== null && dt.types !== undefined
                && Array.prototype.indexOf.call(dt.types, 'Files') !== -1
            }
            const onDragEnter = (event) => {
              if (!hasFiles(event)) return
              event.preventDefault()
              if (event.stopImmediatePropagation) event.stopImmediatePropagation()
              if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
            }
            const onDragOver = (event) => {
              if (!hasFiles(event)) return
              event.preventDefault()
              if (event.stopImmediatePropagation) event.stopImmediatePropagation()
              if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
            }
            const onDragLeave = (event) => {
              if (!hasFiles(event)) return
              event.preventDefault()
              if (event.stopImmediatePropagation) event.stopImmediatePropagation()
            }
            const onDrop = (event) => {
              if (!hasFiles(event)) return
              event.preventDefault()
              if (event.stopImmediatePropagation) event.stopImmediatePropagation()
              stageIntoComposer(event.dataTransfer ? event.dataTransfer.files : [])
            }
            const onPaste = (event) => {
              const cd = event.clipboardData
              if (cd === undefined || cd === null || cd.items === undefined) return
              const files = []
              for (let i = 0; i < cd.items.length; i++) {
                const item = cd.items[i]
                if (item.kind === 'file' && typeof item.type === 'string' && item.type.indexOf('image/') === 0) {
                  const f = typeof item.getAsFile === 'function' ? item.getAsFile() : null
                  if (f !== null && f !== undefined) files.push(f)
                }
              }
              if (files.length === 0) return
              event.preventDefault()
              if (event.stopImmediatePropagation) event.stopImmediatePropagation()
              stageIntoComposer(files)
            }
            window.addEventListener('dragenter', onDragEnter, true)
            window.addEventListener('dragover', onDragOver, true)
            window.addEventListener('dragleave', onDragLeave, true)
            window.addEventListener('drop', onDrop, true)
            window.addEventListener('paste', onPaste, true)
            return () => {
              window.removeEventListener('dragenter', onDragEnter, true)
              window.removeEventListener('dragover', onDragOver, true)
              window.removeEventListener('dragleave', onDragLeave, true)
              window.removeEventListener('drop', onDrop, true)
              window.removeEventListener('paste', onPaste, true)
            }
          }, [])
          return null
        }

        // 2) session 级桥：把当前会话的 inputActions 交给捕获层（不渲染任何可见 UI）
        function SessionBridge(props) {
          React.useEffect(() => {
            store.inputActions = props.inputActions
            return () => { store.inputActions = null }
          }, [props.inputActions])

          return React.createElement('span', { style: { display: 'none' } })
        }

        slots.inject('shell.overlay', () => slots.register(
          { name: 'shell.overlay', id: 'vision-local-capture', order: 0, label: () => '图片拖放/粘贴捕获' },
          () => React.createElement(CaptureLayer),
        ))

        slots.inject('conversation.input.left', () => slots.register(
          { name: 'conversation.input.left', id: 'vision-local-bridge', order: 0, label: () => '视觉图片桥' },
          (props) => React.createElement(SessionBridge, {
            inputActions: props.inputActions,
            input: props.input,
          }),
        ))
      },
    }
  },
})
