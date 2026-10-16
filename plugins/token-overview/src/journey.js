/** Daily usage history, milestone dates and elapsed calendar time; no inferred human working hours. */
export function buildUsageJourney({ days, values, metric = 'processedTokens', estimatedDates = [], through }) {
  const number = value => Math.max(0, Number(value) || 0)
  const dayDistance = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000)
  const estimated = new Set(estimatedDates)
  const records = days.map((date, index) => ({ date, value: number(values[index]), estimated: estimated.has(date) }))
    .filter(row => !through || row.date <= through).sort((a, b) => a.date.localeCompare(b.date))
  const firstIndex = records.findIndex(row => row.value > 0)
  if (firstIndex < 0) return { total: 0, daily: [], milestones: [], elapsedDays: 0, activeDays: 0, longestStreak: null, peak: null, next: null }
  const activeRecords = records.slice(firstIndex)
  const firstDate = activeRecords[0].date, endDate = activeRecords.at(-1).date
  let total = 0, activeDays = 0, estimatedCount = 0, streak = null, longestStreak = null, peak = activeRecords[0]
  const daily = activeRecords.map((row, index) => {
    total += row.value
    activeDays += Number(row.value > 0)
    estimatedCount += Number(row.estimated && row.value > 0)
    if (row.value > peak.value) peak = row
    if (row.value > 0) {
      const previous = activeRecords[index - 1]
      if (streak && previous?.value > 0 && dayDistance(previous.date, row.date) === 1) streak = { ...streak, end: row.date, days: streak.days + 1 }
      else streak = { start: row.date, end: row.date, days: 1 }
      if (!longestStreak || streak.days > longestStreak.days) longestStreak = { ...streak }
    } else streak = null
    return { ...row, cumulative: total, activeDays, estimatedBefore: estimatedCount > 0 }
  })
  const step = metric === 'cost' ? 10000 : metric === 'calls' ? 100000 : metric === 'outputTokens' ? 1e8 : 1e10
  const firstThreshold = metric === 'cost' ? 10 : metric === 'calls' ? 100 : metric === 'outputTokens' ? 1e5 : 1e6
  const thresholds = []
  for (let value = firstThreshold; value < step; value *= 10) if (value <= total) thresholds.push(value)
  for (let value = step; value <= total; value += step) thresholds.push(value)
  let cursor = 0, previous = null
  const milestones = thresholds.map(value => {
    while (daily[cursor].cumulative < value) cursor++
    const row = daily[cursor]
    const milestone = { value, date: row.date, cumulative: row.cumulative, elapsedDays: dayDistance(firstDate, row.date) + 1,
      activeDays: row.activeDays, estimated: row.estimatedBefore,
      sincePreviousDays: previous ? dayDistance(previous.date, row.date) : dayDistance(firstDate, row.date) + 1,
      previousValue: previous?.value || 0, previousDate: previous?.date || firstDate }
    previous = milestone
    return milestone
  })
  const regular = milestones.filter(row => row.value >= step)
  const stages = regular.slice(1).map((row, index) => ({ from: regular[index].value, to: row.value,
    start: regular[index].date, end: row.date, days: dayDistance(regular[index].date, row.date), estimated: row.estimated }))
  const lastStage = stages.at(-1) || null, previousStage = stages.at(-2) || null
  const fastestStage = stages.reduce((best, stage) => !best || stage.days < best.days ? stage : best, null)
  const futureThresholds = [firstThreshold]
  for (let value = firstThreshold * 10; value < step; value *= 10) futureThresholds.push(value)
  futureThresholds.push((Math.floor(total / step) + 1) * step)
  const nextValue = futureThresholds.find(value => value > total)
  const previousValue = milestones.at(-1)?.value || 0
  const elapsedDays = dayDistance(firstDate, endDate) + 1
  return { firstDate, endDate, total, daily, milestones, latest: milestones.at(-1) || null, elapsedDays, activeDays,
    recordedDays: activeRecords.length, missingDays: Math.max(0, elapsedDays - activeRecords.length), containsEstimates: estimatedCount > 0,
    peak: { date: peak.date, value: peak.value, estimated: estimatedCount > 0 }, longestStreak,
    step, lastStage, previousStage, fastestStage,
    next: { value: nextValue, remaining: nextValue - total, progress: Math.max(0, Math.min(1, (total - previousValue) / (nextValue - previousValue))) } }
}
