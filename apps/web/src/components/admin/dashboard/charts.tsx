'use client';

import { useId, type ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { Table, Td, Th } from '@/components/ui/table';
import { cx } from '@/lib/cx';
import { formatDay } from '@/lib/dashboard';

/** Contêiner de gráfico com título (DESIGN §8.8, §10.5). */
export function ChartCard({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cx('flex flex-col gap-3', className)}>
      <div>
        <h2 className="text-h3 font-semibold">{title}</h2>
        {description ? <p className="text-caption text-content-muted">{description}</p> : null}
      </div>
      {children}
    </Card>
  );
}

export interface LineSeries {
  key: string;
  label: string;
  /** Classes de traço/preenchimento a partir dos tokens (`stroke-chart-1`...). */
  strokeClass: string;
  fillClass: string;
  /** Traço tracejado: distingue a série sem depender só de cor. */
  dashed?: boolean;
}

const W = 1000;
const H = 260;
const PAD = { top: 24, right: 28, bottom: 30, left: 40 };

function niceMax(value: number): number {
  if (value <= 4) return Math.max(1, value);
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = magnitude / 2;
  return Math.ceil(value / step) * step;
}

/**
 * Linha por dia (DESIGN §8.8). Valores sobre os pontos em períodos curtos; sempre
 * há totais na legenda e a tabela equivalente (nada depende de hover).
 */
export function LineChart({
  days,
  series,
  label,
}: {
  days: { date: string; values: Record<string, number> }[];
  series: LineSeries[];
  /** Descrição curta para leitores de tela. */
  label: string;
}) {
  const tableId = useId();
  const max = niceMax(Math.max(0, ...days.flatMap((d) => series.map((s) => d.values[s.key] ?? 0))));
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) =>
    PAD.left + (days.length <= 1 ? innerW / 2 : (i * innerW) / (days.length - 1));
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const anchor = (i: number) => (i === days.length - 1 && days.length > 1 ? 'end' : 'middle');
  const labelEvery = Math.max(1, Math.ceil(days.length / 7));
  const showValues = days.length <= 14;
  const totals = series.map((s) => ({
    ...s,
    total: days.reduce((sum, d) => sum + (d.values[s.key] ?? 0), 0),
  }));

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-wrap gap-x-6 gap-y-1 text-body-sm" aria-label="Legenda">
        {totals.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <svg width="24" height="8" aria-hidden>
              <line
                x1="0"
                y1="4"
                x2="24"
                y2="4"
                strokeWidth="3"
                strokeDasharray={s.dashed ? '5 3' : undefined}
                className={s.strokeClass}
              />
            </svg>
            <span>
              {s.label}: <strong>{s.total}</strong> no período
            </span>
          </li>
        ))}
      </ul>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`${label}. Totais: ${totals.map((s) => `${s.label} ${s.total}`).join(', ')}.`}
        aria-describedby={tableId}
      >
        {[0, max / 2, max].map((tick) => (
          <g key={tick}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(tick)}
              y2={y(tick)}
              className="stroke-chart-grid"
              strokeWidth="1"
            />
            <text
              x={PAD.left - 8}
              y={y(tick) + 4}
              textAnchor="end"
              className="fill-content-muted text-caption"
            >
              {Number.isInteger(tick) ? tick : tick.toFixed(1)}
            </text>
          </g>
        ))}
        {days.map((d, i) =>
          i % labelEvery === 0 || i === days.length - 1 ? (
            <text
              key={d.date}
              x={x(i)}
              y={H - 8}
              textAnchor={anchor(i)}
              className="fill-content-muted text-caption"
            >
              {formatDay(d.date)}
            </text>
          ) : null,
        )}
        {series.map((s) => (
          <g key={s.key}>
            <polyline
              fill="none"
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeDasharray={s.dashed ? '6 4' : undefined}
              className={s.strokeClass}
              points={days.map((d, i) => `${x(i)},${y(d.values[s.key] ?? 0)}`).join(' ')}
            />
            {days.map((d, i) => (
              <circle
                key={d.date}
                cx={x(i)}
                cy={y(d.values[s.key] ?? 0)}
                r="3"
                className={s.fillClass}
              />
            ))}
          </g>
        ))}
        {/* Valores visíveis (sem hover) em períodos curtos, só nos dias com movimento:
            primeira série acima do ponto, segunda abaixo. */}
        {showValues
          ? series.slice(0, 2).flatMap((s, index) =>
              days.map((d, i) => {
                const value = d.values[s.key] ?? 0;
                if (value === 0) return null;
                return (
                  <text
                    key={`${s.key}-${d.date}`}
                    x={x(i)}
                    y={y(value) + (index === 0 ? -10 : 18)}
                    textAnchor={anchor(i)}
                    className={cx('text-caption font-semibold', s.fillClass)}
                  >
                    {value}
                  </text>
                );
              }),
            )
          : null}
      </svg>
      <details className="text-body-sm">
        <summary className="cursor-pointer text-link underline">Ver dados em tabela</summary>
        <div id={tableId} className="mt-2">
          <Table caption={label}>
            <thead>
              <tr>
                <Th>Dia</Th>
                {series.map((s) => (
                  <Th key={s.key} className="text-right">
                    {s.label}
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.date}>
                  <Td>{formatDay(d.date)}</Td>
                  {series.map((s) => (
                    <Td key={s.key} className="text-right tabular-nums">
                      {d.values[s.key] ?? 0}
                    </Td>
                  ))}
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </details>
    </div>
  );
}

/**
 * Barras horizontais com o valor sempre visível ao lado (DESIGN §8.8). Lista
 * semântica: lida corretamente por tecnologias assistivas.
 */
export function BarList({
  items,
  label,
}: {
  items: { key: string; label: ReactNode; value: number }[];
  label: string;
}) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <ul className="flex flex-col gap-2" aria-label={label}>
      {items.map((item) => (
        <li
          key={item.key}
          className="grid grid-cols-[minmax(7rem,12rem)_1fr_auto] items-center gap-3 text-body-sm"
        >
          <span className="truncate">{item.label}</span>
          <span className="h-3 rounded-full bg-subtle" aria-hidden>
            <span
              className="block h-3 rounded-full bg-chart-1"
              style={{ width: `${(item.value / max) * 100}%` }}
            />
          </span>
          <span className="min-w-8 text-right font-semibold tabular-nums">{item.value}</span>
        </li>
      ))}
    </ul>
  );
}
