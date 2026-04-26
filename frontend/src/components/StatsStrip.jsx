import { scoreBand } from '../util';

export default function StatsStrip({ incidents }) {
  const totals = {
    critical: 0,
    elevated: 0,
    routine: 0,
    people: 0,
  };

  for (const inc of incidents) {
    const band = scoreBand(inc.impact_score);
    if (band === 'crit') totals.critical += 1;
    else if (band === 'warn') totals.elevated += 1;
    else totals.routine += 1;
    totals.people += Number(inc.estimated_people_affected) || 0;
  }

  return (
    <footer className="stats-strip">
      <div className="stat crit">
        <div className="stat-accent" />
        <span className="k">Critical Alerts</span>
        <span className="v">{totals.critical}</span>
      </div>
      <div className="stat warn">
        <div className="stat-accent" />
        <span className="k">Elevated Risks</span>
        <span className="v">{totals.elevated}</span>
      </div>
      <div className="stat nominal">
        <div className="stat-accent" />
        <span className="k">Routine Ops</span>
        <span className="v">{totals.routine}</span>
      </div>
      <div className="stat people">
        <div className="stat-accent" />
        <span className="k">People Affected</span>
        <span className="v">{totals.people.toLocaleString()}</span>
      </div>
    </footer>
  );
}
