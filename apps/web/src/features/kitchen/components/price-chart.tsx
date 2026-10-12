import {
  formatDate,
  formatMoney,
  unitLabel,
  type KitchenUnit,
  type PriceSeries,
} from '@home/shared'
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'

const COLORS = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)']
const HEIGHT = 220
const PAD = { top: 12, right: 16, bottom: 28, left: 64 }

const storeName = (store: string | null) => store ?? 'No store'
const dayMs = (date: string) => Date.parse(`${date}T00:00:00Z`)
const shortDate = (date: string) => formatDate(date, { day: 'numeric', month: 'short' })

/** About four round tick values covering [min, max] (₦100, ₦250, ₦500… steps). */
function niceTicks(min: number, max: number): number[] {
  const span = Math.max(max - min, max * 0.1, 100)
  const raw = span / 3
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * magnitude >= raw) ?? 10) * magnitude
  const start = Math.max(0, Math.floor((min - span * 0.1) / step) * step)
  const ticks: number[] = []
  for (let v = start; v <= max + span * 0.1 + step; v += step) {
    ticks.push(v)
    if (v >= max) break
  }
  return ticks
}

/**
 * Per-unit price over time, one line per store, with a crosshair that snaps to the nearest
 * purchase date (pointer or arrow keys) and lists every store's price there. The purchases
 * table beside it carries the same numbers without hovering.
 */
export function PriceChart({
  series,
  unit,
  tableId,
  caption,
}: {
  series: PriceSeries[]
  unit: KitchenUnit
  /** In place of "Price per kg…", for a single line that isn't a store's prices. */
  caption?: string
  /** The table with the same data, for screen readers. */
  tableId: string
}) {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [active, setActive] = useState<number | null>(null)
  const titleId = useId()

  useEffect(() => {
    const el = box.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const dates = [...new Set(series.flatMap((s) => s.points.map((p) => p.date)))].sort()
  const values = series.flatMap((s) => s.points.map((p) => p.unitPriceMinor))
  const ticks = niceTicks(Math.min(...values), Math.max(...values))
  const yMin = ticks[0] ?? 0
  const yMax = ticks.at(-1) ?? 1
  const plotW = Math.max(width - PAD.left - PAD.right, 1)
  const plotH = HEIGHT - PAD.top - PAD.bottom
  const first = dates[0] ?? ''
  const last = dates.at(-1) ?? ''
  const spanMs = dayMs(last) - dayMs(first)
  const x = (date: string) =>
    PAD.left + (spanMs === 0 ? plotW / 2 : ((dayMs(date) - dayMs(first)) / spanMs) * plotW)
  const y = (v: number) => PAD.top + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH

  function nearest(clientX: number) {
    const rect = box.current?.getBoundingClientRect()
    if (!rect || dates.length === 0) return null
    const px = clientX - rect.left
    let best = 0
    dates.forEach((d, i) => {
      if (Math.abs(x(d) - px) < Math.abs(x(dates[best] ?? d) - px)) best = i
    })
    return best
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const step = e.key === 'ArrowRight' ? 1 : -1
    setActive((i) =>
      Math.min(dates.length - 1, Math.max(0, (i ?? (step > 0 ? -1 : dates.length)) + step)),
    )
  }

  const activeDate = active === null ? null : (dates[active] ?? null)
  const readout = activeDate
    ? series.flatMap((s, i) => {
        const point = s.points.findLast((p) => p.date === activeDate)
        return point
          ? [
              {
                store: caption && !s.store ? '' : storeName(s.store),
                color: COLORS[i],
                value: point.unitPriceMinor,
              },
            ]
          : []
      })
    : []
  const xLabels = dates.length <= 1 ? dates : [first, last]
  const per = unitLabel(unit)

  return (
    <figure className="flex flex-col gap-3">
      <figcaption id={titleId} className="text-sm text-muted-foreground">
        {caption ?? (
          <>
            Price per {per}
            {series.length > 1 ? ', by store' : series[0]?.store ? ` at ${series[0].store}` : ''}
          </>
        )}
      </figcaption>

      {series.length > 1 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label="Stores">
          {series.map((s, i) => (
            <li key={storeName(s.store)} className="flex items-center gap-1.5">
              <svg width="16" height="8" aria-hidden className="shrink-0">
                <line
                  x1="1"
                  y1="4"
                  x2="15"
                  y2="4"
                  stroke={COLORS[i]}
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              {storeName(s.store)}
            </li>
          ))}
        </ul>
      )}

      <div
        ref={box}
        className="relative touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        style={{ height: HEIGHT }}
        tabIndex={0}
        role="group"
        aria-labelledby={titleId}
        aria-describedby={tableId}
        onPointerMove={(e: PointerEvent) => setActive(nearest(e.clientX))}
        onPointerDown={(e: PointerEvent) => setActive(nearest(e.clientX))}
        onPointerLeave={() => setActive(null)}
        onFocus={() => setActive((i) => i ?? dates.length - 1)}
        onBlur={() => setActive(null)}
        onKeyDown={onKeyDown}
      >
        {width > 0 && (
          <svg width={width} height={HEIGHT} aria-hidden className="overflow-visible">
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={PAD.left}
                  x2={PAD.left + plotW}
                  y1={y(t)}
                  y2={y(t)}
                  stroke="var(--border)"
                  strokeWidth="1"
                />
                <text
                  x={PAD.left - 8}
                  y={y(t)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="fill-muted-foreground text-[11px] tabular-nums"
                >
                  {formatMoney(t)}
                </text>
              </g>
            ))}
            {xLabels.map((d, i) => (
              <text
                key={d}
                x={x(d)}
                y={HEIGHT - 8}
                textAnchor={xLabels.length === 1 ? 'middle' : i === 0 ? 'start' : 'end'}
                className="fill-muted-foreground text-[11px]"
              >
                {shortDate(d)}
              </text>
            ))}
            {activeDate && (
              <line
                x1={x(activeDate)}
                x2={x(activeDate)}
                y1={PAD.top}
                y2={PAD.top + plotH}
                stroke="var(--muted-foreground)"
                strokeWidth="1"
              />
            )}
            {series.map((s, i) => (
              <g key={storeName(s.store)}>
                {s.points.length > 1 && (
                  <path
                    d={s.points
                      .map((p, j) => `${j === 0 ? 'M' : 'L'}${x(p.date)},${y(p.unitPriceMinor)}`)
                      .join(' ')}
                    fill="none"
                    stroke={COLORS[i]}
                    strokeWidth="2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                )}
                {s.points.map((p, j) => (
                  <circle
                    key={`${p.date}-${j}`}
                    cx={x(p.date)}
                    cy={y(p.unitPriceMinor)}
                    r={p.date === activeDate ? 5 : 4}
                    fill={COLORS[i]}
                    stroke="var(--background)"
                    strokeWidth="2"
                  />
                ))}
              </g>
            ))}
          </svg>
        )}

        {activeDate && readout.length > 0 && (
          <div
            className="pointer-events-none absolute top-0 z-10 flex min-w-36 flex-col gap-1 rounded-lg border bg-popover px-3 py-2 text-sm shadow-md"
            style={
              x(activeDate) > width / 2
                ? { right: width - x(activeDate) + 8 }
                : { left: x(activeDate) + 8 }
            }
          >
            <span className="text-xs text-muted-foreground">{formatDate(activeDate)}</span>
            {readout.map((r) => (
              <span key={r.store} className="flex items-center gap-2">
                <svg width="12" height="8" aria-hidden className="shrink-0">
                  <line
                    x1="1"
                    y1="4"
                    x2="11"
                    y2="4"
                    stroke={r.color}
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
                <span className="font-semibold tabular-nums">{formatMoney(r.value)}</span>
                <span className="text-muted-foreground">{r.store}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </figure>
  )
}
