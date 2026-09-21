import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { WaterfallModel } from '../types'
import { colorForFifth } from '../fifthColors'

type Props = { model: WaterfallModel }

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 })

const HEADER_H = 32
const FOOTER_H = 56
const BRIDGE_FOOTER_H = 76
const GAP_ROW_H = 44
/** Min slice height so formatted TPC amounts fit inside every segment */
const MIN_SLICE_PX = 34
const MIN_BRIDGE_STEP_PX = 32
const CALLOUT_W = 152

type SegLayout = { label: string; val: number; i: number; bottom: number; h: number }

function buildReadableSegLayouts(segments: number[], segLabels: string[]): {
  layouts: SegLayout[]
  stackHeight: number
} {
  const active = segments
    .map((val, i) => ({ val, label: segLabels[i], i }))
    .filter((s) => s.val > 0)

  if (!active.length) return { layouts: [], stackHeight: 0 }

  const sum = active.reduce((a, s) => a + s.val, 0) || 1
  const baseH = Math.max(440, active.length * MIN_SLICE_PX)
  const heights = active.map((s) => Math.max((s.val / sum) * baseH, MIN_SLICE_PX))
  const stackHeight = heights.reduce((a, b) => a + b, 0)

  let bottom = 0
  const layouts = active.map((s, idx) => {
    const h = heights[idx]
    const row = { label: s.label, val: s.val, i: s.i, bottom, h }
    bottom += h
    return row
  })
  return { layouts, stackHeight }
}

function useChartLayout(containerW: number, bridgeCount: number, stackBarH: number) {
  return useMemo(() => {
    const w = Math.max(containerW, 720)
    const steps = Math.max(bridgeCount, 1)
    const bridgeShare = Math.max(0.42, Math.min(0.68, steps * 0.055))
    const endShare = (1 - bridgeShare) / 2
    const endColW = Math.max(260, w * endShare)
    const bridgeColW = Math.max(steps * 72, w * bridgeShare)
    const barW = Math.min(180, Math.max(96, endColW - CALLOUT_W * 2 - 24))
    const stepW = Math.max(68, Math.min(110, bridgeColW / steps))
    const footerH = Math.max(FOOTER_H, BRIDGE_FOOTER_H)
    const colH = HEADER_H + stackBarH + footerH

    return { barW, stepW, bridgeColW, endColW, footerH, colH, stackBarH }
  }, [containerW, bridgeCount, stackBarH])
}

export default function WaterfallChart({ model }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerW, setContainerW] = useState(960)

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () => setContainerW(el.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const { car_labels, car_totals, segments, steps, total_gap, segment_level } = model
  const bridge = steps[0] ?? []
  const segLabels = segments.map((s) => s.label)

  const leftBar = buildReadableSegLayouts(segments.map((s) => s.values[0]), segLabels)
  const rightBar = buildReadableSegLayouts(
    segments.map((s) => s.values[s.values.length - 1]),
    segLabels,
  )
  const stackBarH = Math.max(leftBar.stackHeight, rightBar.stackHeight, 440)
  const layout = useChartLayout(containerW, bridge.length, stackBarH)

  const maxTotal = Math.max(...car_totals, 1)
  const valueScale = (v: number) => (v / maxTotal) * layout.stackBarH

  let running = car_totals[0]
  const stepLayouts = bridge.map((step) => {
    const isUp = step.delta > 0
    const h = Math.max(valueScale(Math.abs(step.delta)), MIN_BRIDGE_STEP_PX)
    const bottom = valueScale(isUp ? running : running + step.delta)
    running += step.delta
    const gapPct = total_gap !== 0 ? (step.delta / total_gap) * 100 : 0
    return { step, h, bottom, isUp, gapPct }
  })

  const hasOtherBucket = segments.some((s) => s.label === 'Other')

  return (
    <div ref={containerRef} className="w-full min-h-[540px]">
      {segment_level && (
        <p className="text-xs text-slate-400 mb-3">
          Stacked bars and gap steps at <span className="text-slate-200">{segment_level}</span>
          {hasOtherBucket ? ' (remainder in Other)' : ''}
        </p>
      )}

      <div className="overflow-x-auto pb-2">
        <div className="relative" style={{ minWidth: Math.max(containerW, 720), height: layout.colH + GAP_ROW_H }}>
          <div className="flex items-end justify-between w-full gap-2" style={{ height: layout.colH }}>
            <StackedBar
              label={car_labels[0]}
              total={car_totals[0]}
              segLayouts={leftBar.layouts}
              barWidth={layout.barW}
              stackHeight={leftBar.stackHeight}
              columnWidth={layout.endColW}
              footerH={layout.footerH}
            />

            <div
              className="flex items-end justify-center shrink-0 overflow-x-auto"
              style={{ width: layout.bridgeColW, minWidth: bridge.length * 72, gap: 4, paddingTop: HEADER_H }}
            >
              {stepLayouts.map(({ step, h, bottom, isUp, gapPct }) => (
                <BridgeStep
                  key={step.label}
                  step={step}
                  h={h}
                  bottom={bottom}
                  isUp={isUp}
                  gapPct={gapPct}
                  stepW={layout.stepW}
                  barHeight={layout.stackBarH}
                  footerH={layout.footerH}
                />
              ))}
            </div>

            <StackedBar
              label={car_labels[car_labels.length - 1]}
              total={car_totals[car_totals.length - 1]}
              segLayouts={rightBar.layouts}
              barWidth={layout.barW}
              stackHeight={rightBar.stackHeight}
              columnWidth={layout.endColW}
              footerH={layout.footerH}
            />
          </div>

          <div
            className="absolute left-0 right-0 flex items-center justify-center gap-3"
            style={{ top: layout.colH + 4 }}
          >
            <div className="h-0.5 w-20 bg-blue-400 relative shrink-0">
              <span className="absolute -right-1 -top-1 text-blue-400 text-xs">›</span>
            </div>
            <span className="bg-[#1F2F69] text-white px-4 py-1.5 rounded-full tabular-nums text-sm font-semibold">
              {total_gap > 0 ? '+' : ''}{fmt(total_gap)}
            </span>
            <div className="h-0.5 w-20 bg-blue-400 relative shrink-0">
              <span className="absolute -left-1 -top-1 text-blue-400 text-xs">‹</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function SegmentCallout({
  segLabel,
  i,
  bottom,
  h,
  barHeight,
  side,
}: {
  segLabel: string
  i: number
  bottom: number
  h: number
  barHeight: number
  side: 'left' | 'right'
}) {
  const top = barHeight - bottom - h / 2
  const fontSize = 10
  const isLeft = side === 'left'

  return (
    <div
      className={`absolute leading-snug ${isLeft ? 'right-0 text-right' : 'left-0 text-left'}`}
      style={{ top, transform: 'translateY(-50%)', width: CALLOUT_W, fontSize }}
    >
      <span className={`inline-flex items-start gap-1 max-w-full ${isLeft ? 'flex-row-reverse ml-auto' : ''}`}>
        <span
          className="inline-block w-2 h-2 rounded-sm shrink-0 mt-0.5"
          style={{ background: colorForFifth(segLabel, i) }}
        />
        <span className="text-slate-200 break-words">{segLabel}</span>
      </span>
    </div>
  )
}

function StackedBar({
  label,
  total,
  segLayouts,
  barWidth,
  stackHeight,
  columnWidth,
  footerH,
}: {
  label: string
  total: number
  segLayouts: SegLayout[]
  barWidth: number
  stackHeight: number
  columnWidth: number
  footerH: number
}) {
  return (
    <div className="flex flex-col shrink-0 overflow-visible" style={{ width: columnWidth }}>
      <div className="flex items-center justify-center shrink-0" style={{ height: HEADER_H }}>
        <span className="text-sm font-bold tabular-nums text-slate-100">{fmt(total)}</span>
      </div>

      <div className="flex items-end justify-center shrink-0 overflow-visible">
        <div className="relative shrink-0" style={{ width: CALLOUT_W, height: stackHeight }}>
          {segLayouts.map(({ label: segLabel, i, bottom, h }, idx) =>
            idx % 2 === 0 ? (
              <SegmentCallout
                key={`l-${segLabel}-${i}`}
                segLabel={segLabel}
                i={i}
                bottom={bottom}
                h={h}
                barHeight={stackHeight}
                side="left"
              />
            ) : null,
          )}
        </div>

        <div className="relative shrink-0 rounded-sm overflow-hidden" style={{ width: barWidth, height: stackHeight }}>
          {segLayouts.map(({ label: segLabel, val, i, bottom, h }) => (
            <div
              key={`${segLabel}-${i}`}
              className="absolute left-0 right-0 flex items-center justify-center px-0.5"
              style={{ height: h, bottom, background: colorForFifth(segLabel, i) }}
              title={`${segLabel}: ${fmt(val)}`}
            >
              <span className="tabular-nums text-[10px] text-white font-medium pointer-events-none text-center leading-none">
                {fmt(val)}
              </span>
            </div>
          ))}
        </div>

        <div className="relative shrink-0" style={{ width: CALLOUT_W, height: stackHeight }}>
          {segLayouts.map(({ label: segLabel, i, bottom, h }, idx) =>
            idx % 2 === 1 ? (
              <SegmentCallout
                key={`r-${segLabel}-${i}`}
                segLabel={segLabel}
                i={i}
                bottom={bottom}
                h={h}
                barHeight={stackHeight}
                side="right"
              />
            ) : null,
          )}
        </div>
      </div>

      <div className="flex items-start justify-center pt-2 px-1 shrink-0" style={{ height: footerH }}>
        <span className="text-[10px] text-slate-400 text-center leading-snug" title={label}>
          {label}
        </span>
      </div>
    </div>
  )
}

function BridgeStep({
  step,
  h,
  bottom,
  isUp,
  gapPct,
  stepW,
  barHeight,
  footerH,
}: {
  step: { label: string; delta: number }
  h: number
  bottom: number
  isUp: boolean
  gapPct: number
  stepW: number
  barHeight: number
  footerH: number
}) {
  return (
    <div className="flex flex-col shrink-0" style={{ width: stepW, height: barHeight + footerH }}>
      <div className="relative w-full shrink-0" style={{ height: barHeight }}>
        <div
          className="absolute rounded-sm left-1/2 -translate-x-1/2"
          style={{
            width: Math.max(stepW - 14, 36),
            height: h,
            bottom,
            background: isUp ? '#C0392B' : '#1FA187',
          }}
        />
      </div>
      <div className="pt-2 text-center px-0.5" style={{ minHeight: footerH - 8 }}>
        <div className="text-[10px] font-medium text-slate-200 leading-snug break-words" title={step.label}>
          {step.label}
        </div>
        <div className={`text-[10px] font-semibold tabular-nums mt-0.5 ${isUp ? 'text-red-300' : 'text-emerald-300'}`}>
          {step.delta > 0 ? '+' : ''}{fmt(step.delta)}
        </div>
        <div className="text-[9px] tabular-nums text-slate-500">{gapPct.toFixed(0)}% of gap</div>
      </div>
    </div>
  )
}
