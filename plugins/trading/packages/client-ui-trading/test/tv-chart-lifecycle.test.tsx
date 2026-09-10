/** A closed chart must not retain a redraw requested by its marker primitive.
 * @vitest-environment jsdom
 */
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { TvChart } from '../src/client/TvChart.tsx'

vi.mock('lightweight-charts', () => ({
  AreaSeries: {}, CandlestickSeries: {}, HistogramSeries: {}, LineSeries: {},
  ColorType: { Solid: 'solid' }, CrosshairMode: { Normal: 0 }, LineStyle: { Dashed: 2 },
  createChart: () => {
    let removed = false
    let drawFrame = 0
    const rangeListeners = new Set<() => void>()
    const requestDraw = () => {
      cancelAnimationFrame(drawFrame)
      drawFrame = requestAnimationFrame(() => {
        if (removed) throw new Error('Object is disposed')
      })
    }
    const timeScale = {
      subscribeVisibleLogicalRangeChange: (listener: () => void) => rangeListeners.add(listener),
      unsubscribeVisibleLogicalRangeChange: (listener: () => void) => rangeListeners.delete(listener),
      getVisibleLogicalRange: () => null,
      resetTimeScale: () => {}, scrollToRealTime: () => {},
    }
    return {
      addSeries: () => ({ applyOptions: () => {}, setData: () => {}, update: () => {}, detachPrimitive: requestDraw }),
      applyOptions: () => {}, panes: () => [], timeScale: () => timeScale,
      subscribeCrosshairMove: () => {}, unsubscribeCrosshairMove: () => {},
      remove: () => { removed = true; cancelAnimationFrame(drawFrame); rangeListeners.clear() },
    }
  },
  // Lightweight Charts detachPrimitive() requests a redraw even after chart.remove().
  createSeriesMarkers: (series: { detachPrimitive: () => void }) => ({
    setMarkers: () => {}, detach: () => series.detachPrimitive(),
  }),
}))

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('cancels the marker redraw when a chart closes and can mount another chart', () => {
  const frames = new Map<number, FrameRequestCallback>()
  let nextFrame = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++nextFrame, callback); return nextFrame })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  const props = {
    bars: [], volumes: [], dataKey: 'us:AAPL:1d', intraday: false,
    mainOverlays: [], subIndicators: [], readoutIndex: null, onHoverIndex: () => {},
  }
  const first = render(<TvChart {...props} />)
  first.unmount()
  expect(() => {
    for (const [id, frame] of frames) { frames.delete(id); frame(0) }
  }).not.toThrow()
  const second = render(<TvChart {...props} />)
  second.unmount()
  expect(frames.size).toBe(0)
})
