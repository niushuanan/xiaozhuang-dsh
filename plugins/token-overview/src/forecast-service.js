/** One worker per serialized collector, terminated and awaited with its owner. */
import { Worker } from 'node:worker_threads'

export function createForecastService() {
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
      if (result.error) request.reject(new Error(result.error))
      else request.resolve(result)
    })
    const fail = error => {
      if (worker !== current) return
      worker = undefined
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
        pending = { resolve, reject }
        try { current.postMessage({ history, accuracy, now }) }
        catch (error) { pending = undefined; reject(error) }
      })
    },
    async dispose() {
      disposed = true
      pending?.reject(new Error('Token forecast service disposed'))
      pending = undefined
      const current = worker
      worker = undefined
      if (current) await current.terminate()
    },
  }
}
