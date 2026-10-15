/** Durable hourly observations for the intraday forecast; missing hours stay unavailable. */
export const TIME_ZONE = 'Asia/Shanghai'
const sum = rows => rows.reduce((n, row) => n + row.tokens, 0)
const count = value => Math.max(0, Number(value) || 0)

/** Interpret the collector's legacy local timestamps in the forecast timezone. */
export function reportTimestamp(value) {
  return typeof value === 'number' ? value : Date.parse(/[Zz]|[+-]\d\d:\d\d$/.test(value || '') ? value : `${value}+08:00`)
}

/** Return the Shanghai date and fractional hour for one instant. */
export function forecastClock(now) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(now)).map(part => [part.type, part.value]))
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) + Number(parts.minute) / 60 + Number(parts.second) / 3600 }
}

function totalsAt(data, client, index) {
  const source = data.dailyClients?.[client]
  return {
    tokens: count(source?.processedTokens?.[index]), calls: count(source?.calls?.[index]),
    cost: count(source?.cost?.[index]), cacheTokens: count(source?.cacheReadTokens?.[index]) + count(source?.cacheWriteTokens?.[index]),
    outputTokens: count(source?.outputTokens?.[index]),
  }
}

function hourAt(hourly, day, hour, clientIndex, client) {
  const detail = hourly.clientMetrics?.[client]?.[day]?.[hour]
  return {
    tokens: count(hourly.cells[day]?.[hour]?.[clientIndex]),
    calls: detail ? count(detail[0]) : null, cost: detail ? count(detail[1]) : null,
    cacheTokens: detail ? count(detail[4]) + count(detail[5]) : null,
    outputTokens: detail ? count(detail[3]) : null,
  }
}

/**
 * Merge one scan with retained observations, choosing whole hourly measurements by token volume.
 * Completed client days train only when their observed hours reconcile with protected daily totals.
 * @param previous - prior hourly ledger, or null on first collection.
 * @param hourly - per-platform hourly snapshot.
 * @param data - canonical daily dataset, optionally with estimatedDates.
 * @param now - observation cutoff in milliseconds.
 * @returns a serializable ledger; input snapshots are not modified.
 */
export function mergeForecastHistory(previous, hourly, data, now) {
  const clock = forecastClock(now)
  const clients = [...new Set([...(previous?.clients || []), ...hourly.meta.clients])]
  const records = new Map((previous?.days || []).map(day => [day.date, structuredClone(day)]))
  const dailyIndex = new Map(data.days.map((date, i) => [date, i]))
  const hourlyIndex = new Map(hourly.days.map((date, i) => [date, i]))
  const estimated = new Set(data.estimatedDates || [])
  for (const date of [...new Set([...data.days, ...hourly.days])].sort()) {
    if (date > clock.date) continue
    const record = records.get(date) || { date, totals: {}, hours: {}, complete: {} }
    const di = dailyIndex.get(date)
    const hi = hourlyIndex.get(date)
    for (const client of clients) {
      const ci = hourly.meta.clients.indexOf(client)
      const before = record.hours[client]
      if (hi !== undefined && ci >= 0) {
        record.hours[client] = Array.from({ length: 24 }, (_, hour) => {
          const row = hourAt(hourly, hi, hour, ci, client)
          const stored = before?.[hour]
          if (date === clock.date && hour > clock.hour) return stored || { tokens: 0, calls: null, cost: null, cacheTokens: null, outputTokens: null }
          return stored && stored.tokens > row.tokens ? stored : row
        })
      }
      const canonical = di === undefined ? record.totals[client] : totalsAt(data, client, di)
      if (canonical && (!record.totals[client] || canonical.tokens >= record.totals[client].tokens)) record.totals[client] = canonical
      const hours = record.hours[client]
      const total = record.totals[client]?.tokens
      const closedObservation = date < clock.date && hi !== undefined && ci >= 0
      record.complete[client] = date < clock.date && (record.complete[client] || closedObservation) && !estimated.has(date) && hours !== undefined && total !== undefined
        && Math.abs(sum(hours) - total) <= Math.max(1, total * .01)
    }
    record.estimated = estimated.has(date) || record.estimated === true
    if (record.estimated) for (const client of clients) record.complete[client] = false
    if (date === clock.date) record.observedThrough = now
    records.set(date, record)
  }
  return { version: 1, timeZone: TIME_ZONE, clients, updatedAt: now, days: [...records.values()].sort((a, b) => a.date.localeCompare(b.date)) }
}
