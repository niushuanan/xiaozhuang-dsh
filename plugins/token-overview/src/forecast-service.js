/** One worker per serialized collector, terminated and awaited with its owner. */
import { Worker } from 'node:worker_threads'

export function createForecastService({ timeoutMs = 60000 } = {}) {
  let worker, pending, disposed = false
  const ensureWorker = () => {
    if (worker) return worker
    const current = new Worker(new URL('./forecast-worker.js', import.meta.url))
    worker = current
    current.on('message', result => {
      if (worker !== current) return
      const request = pending
      pending = undefined
      if (!request) return
      clearTimeout(request.timer)
      if (result.error) request.reject(new Error(result.error))
      else request.resolve(result)
    })
    const fail = error => {
      if (worker !== current) return
      worker = undefined
      clearTimeout(pending?.timer)
      pending?.reject(error)
      pending = undefined
    }
    current.once('error', fail)
    current.once('exit', code => { fail(new Error(`预测线程已结束 (${code})`)) })
    return current
  }
  return {
    calculate(history, accuracy, now) {
      if (disposed) return Promise.reject(new Error('Token forecast service disposed'))
      if (pending) return Promise.reject(new Error('Token forecast calculation already running'))
      return new Promise((resolve, reject) => {
        const current = ensureWorker()
        const request = { resolve, reject, timer: undefined }
        pending = request
        request.timer = setTimeout(() => {
          if (worker !== current || pending !== request) return
          worker = undefined
          pending = undefined
          void current.terminate().then(
            () => request.reject(new Error('预测计算超时，已停止本次训练，将在下一轮重试')),
            error => request.reject(error),
          )
        }, timeoutMs)
        try { current.postMessage({ history, accuracy, now }) }
        catch (error) { clearTimeout(request.timer); pending = undefined; reject(error) }
      })
    },
    async dispose() {
      disposed = true
      clearTimeout(pending?.timer)
      pending?.reject(new Error('Token forecast service disposed'))
      pending = undefined
      const current = worker
      worker = undefined
      if (current) await current.terminate()
    },
  }
}
