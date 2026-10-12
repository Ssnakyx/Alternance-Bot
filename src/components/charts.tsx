/**
 * Petits graphiques en SVG/HTML, sans dépendance : une seule couleur par
 * graphique (une seule série), barres fines arrondies, valeurs au survol.
 */

export function StatTile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

/** Histogramme vertical (une barre par semaine). */
export function WeeklyBars({ data, unit }: { data: { label: string; value: number }[]; unit: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const height = 140;
  const barWidth = 22;
  const gap = 18;
  const width = data.length * (barWidth + gap);

  return (
    <figure>
      <svg viewBox={`0 0 ${width} ${height + 24}`} className="h-44 w-full" role="img" aria-label={`${unit} par semaine`}>
        <line x1={0} x2={width} y1={height} y2={height} className="stroke-slate-200" strokeWidth={1} />
        {data.map((d, i) => {
          const h = d.value === 0 ? 0 : Math.max(4, (d.value / max) * (height - 18));
          const x = i * (barWidth + gap) + gap / 2;
          return (
            <g key={d.label}>
              <title>{`Semaine du ${d.label} : ${d.value} ${unit}`}</title>
              {/* Zone de survol plus grande que la barre */}
              <rect x={x - gap / 2} y={0} width={barWidth + gap} height={height} fill="transparent" />
              {h > 0 && (
                <path
                  d={`M${x},${height} V${height - h + 4} q0,-4 4,-4 h${barWidth - 8} q4,0 4,4 V${height} Z`}
                  className="fill-indigo-500"
                />
              )}
              {d.value > 0 && (
                <text x={x + barWidth / 2} y={height - h - 5} textAnchor="middle" className="fill-slate-600 text-[11px]">
                  {d.value}
                </text>
              )}
              <text x={x + barWidth / 2} y={height + 16} textAnchor="middle" className="fill-slate-400 text-[10px]">
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

/** Barres horizontales avec libellé et valeur en clair. */
export function HorizontalBars({
  rows,
  colorClass = "bg-indigo-500",
}: {
  rows: { label: string; value: number; detail?: string }[];
  colorClass?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label} title={r.detail ? `${r.label} : ${r.detail}` : `${r.label} : ${r.value}`}>
          <div className="mb-1 flex justify-between gap-2 text-sm">
            <span className="text-slate-700">{r.label}</span>
            <span className="tabular-nums text-slate-500">{r.detail ?? r.value}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100">
            <div
              className={`h-2 rounded-full ${colorClass}`}
              style={{ width: `${r.value === 0 ? 0 : Math.max(2, (r.value / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
