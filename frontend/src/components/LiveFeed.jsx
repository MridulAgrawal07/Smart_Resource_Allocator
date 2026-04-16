import { useEffect, useRef } from 'react';
import { Radio, Users, FileText, Clock, Inbox } from 'lucide-react';
import { scoreBand, formatScore, formatRelative } from '../util';

const URGENCY_LABEL = {
  crit: 'Critical',
  warn: 'Elevated',
  nominal: 'Routine',
};

function IncidentCard({ inc, active, onSelect }) {
  const band = scoreBand(inc.impact_score);
  const ref = useRef(null);
  useEffect(() => {
    if (active && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [active]);
  return (
    <button
      ref={ref}
      type="button"
      className={`incident-card ${active ? 'active' : ''}`}
      onClick={() => onSelect && onSelect(inc._id)}
    >
      <div className="top-line">
        <span className={`urgency-badge ${band}`}>
          <span className="dot" />
          {URGENCY_LABEL[band]}
        </span>
        <span className="score-num">{formatScore(inc.impact_score)}</span>
      </div>
      <p className="need">{inc.summarized_need}</p>
      <div className="meta">
        <span className="cat-tag">{inc.category}</span>
        <span className="pair">
          <Users />
          <strong>{inc.estimated_people_affected ?? 0}</strong>
        </span>
        <span className="pair">
          <FileText />
          <strong>{inc.contributing_count ?? 0}</strong>
        </span>
        <span className="pair">
          <Clock />
          {formatRelative(inc.last_updated_at || inc.created_at)}
        </span>
      </div>
    </button>
  );
}

export default function LiveFeed({ incidents, selectedId, onSelect }) {
  const sorted = [...incidents].sort(
    (a, b) => (Number(b.impact_score) || 0) - (Number(a.impact_score) || 0)
  );

  return (
    <aside className="feed-region card">
      <div className="feed-header">
        <div className="title-block">
          <div className="icon-bubble" aria-hidden="true">
            <Radio strokeWidth={2.2} />
          </div>
          <div>
            <h2>Live Feed</h2>
            <div className="subtitle">Sorted by urgency</div>
          </div>
        </div>
        <span className="count">{sorted.length} active</span>
      </div>
      <div className="feed-list">
        {sorted.length === 0 ? (
          <div className="feed-empty">
            <div className="icon">
              <Inbox />
            </div>
            No incidents match the current view.
          </div>
        ) : (
          sorted.map((inc) => (
            <IncidentCard
              key={inc._id}
              inc={inc}
              active={selectedId === inc._id}
              onSelect={onSelect}
            />
          ))
        )}
      </div>
    </aside>
  );
}
