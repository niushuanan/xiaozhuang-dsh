/** Keep model training off the Host event loop; the worker owns reusable temporal model fits. */
import { parentPort } from 'node:worker_threads'
import { buildForecast } from './forecast.js'
import { recordForecastAccuracy } from './forecast-accuracy.js'

const memo = {}
parentPort.on('message', ({ history, accuracy, now }) => {
  try {
    const forecast = buildForecast(history, { now, memo })
    forecast.calculatedAt = Date.now()
    const outcome = recordForecastAccuracy(accuracy, forecast, history)
    for (const [client, row] of Object.entries(forecast.forecasts)) row.accuracy = outcome.summary[client]
    parentPort.postMessage({ forecast, accuracy: outcome.ledger })
  } catch (error) {
    parentPort.postMessage({ error: error instanceof Error ? error.message : String(error) })
  }
})
