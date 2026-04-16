import { scoreBand } from '../util';

export default function StatsStrip({ incidents, totalUnfiltered }) {
  const totals = {
    critical: 0,
    elevated: 0,
    routine: 0,
    people: 0,
    reports: 0,
  };
  const categories = new Map();

  for (const inc of incidents) {
    const band = scoreBand(inc.impact_score);
    if (band === 'crit') totals.critical += 1;
    else if (band === 'warn') totals.elevated += 1;
    else totals.routine += 1;
    totals.people += Number(inc.estimated_people_affected) || 0;
    totals.reports += Number(inc.contributing_count) || 0;
    if (inc.category) {
      categories.set(inc.category, (categories.get(inc.category) || 0) + 1);
    }
  }

  return (
    <footer className="stats-strip">
      <div className="stat">
        <span className="k"><span className="icon-dot" /> In view</span>
        <span className="v">
          {incidents.length}
          <span className="unit">/ {totalUnfiltered} total</span>
        </span>
      </div>
      <div className="stat crit">
        <span className="k"><span className="icon-dot" /> Critical</span>
        <span className="v">{totals.critical}</span>
      </div>
      <div className="stat warn">
        <span className="k"><span className="icon-dot" /> Elevated</span>
        <span className="v">{totals.elevated}</span>
      </div>
      <div className="stat nominal">
        <span className="k"><span className="icon-dot" /> Routine</span>
        <span className="v">{totals.routine}</span>
      </div>
      <div className="stat">
        <span className="k"><span className="icon-dot" /> People affected</span>
        <span className="v">{totals.people.toLocaleString()}</span>
      </div>
      <div className="stat">
        <span className="k"><span className="icon-dot" /> Source reports</span>
        <span className="v">{totals.reports}</span>
      </div>
      <div className="legend-slot">
        <span className="h">Top categories</span>
        {[...categories.entries()].slice(0, 4).map(([cat, n]) => (
          <span key={cat} className="row">
            <span className="dot" />
            {cat} · {n}
          </span>
        ))}
      </div>
    </footer>
  );
}
