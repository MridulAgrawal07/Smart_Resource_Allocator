import { useEffect, useRef, useState } from 'react';
import { Radio, Users, FileText, Clock, Inbox, AlertCircle, CheckCircle2 } from 'lucide-react';
import { scoreBand, formatRelative } from '../util';

const URGENCY_LABEL = {
  crit: 'Critical',
  warn: 'Elevated',
  nominal: 'Routine',
};

function heatClass(score) {
  if (score >= 80) return 'high';
  if (score >= 40) return 'mid';
  return 'low';
}

function UnassignedCard({ inc, active, onSelect }) {
  const band = scoreBand(inc.impact_score);
  const priorityScore = Math.round((Number(inc.impact_score) || 0) * 100);
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
        <div className="priority-heat">
          <span className="score-label">{priorityScore}</span>
          <div className="heat-bar">
            <div className={`heat-fill ${heatClass(priorityScore)}`} style={{ width: `${priorityScore}%` }} />
          </div>
        </div>
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
      <div className="needs-match-tag">
        <AlertCircle size={11} strokeWidth={2.4} />
        Needs matching
      </div>
    </button>
  );
}

function AssignedCard({ inc, active, onSelect }) {
  const band = scoreBand(inc.impact_score);
  const ref = useRef(null);
  useEffect(() => {
    if (active && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [active]);

  const volunteers = inc.assigned_volunteers || [];

  return (
    <button
      ref={ref}
      type="button"
      className={`incident-card assigned-card ${active ? 'active' : ''}`}
      onClick={() => onSelect && onSelect(inc._id)}
    >
      <div className="top-line">
        <span className={`urgency-badge ${band}`}>
          <span className="dot" />
          {URGENCY_LABEL[band]}
        </span>
        <span className="assigned-status-badge">
          <CheckCircle2 size={11} strokeWidth={2.4} />
          Assigned
        </span>
      </div>
      <p className="need">{inc.summarized_need}</p>
      {volunteers.length > 0 && (
        <div className="vol-list">
          {volunteers.map((vol) => (
            <div key={vol.id} className="vol-row">
              <span className="vol-avatar-mini">{vol.name[0]}</span>
              <span className="vol-name">{vol.name}</span>
            </div>
          ))}
        </div>
      )}
      <div className="meta">
        <span className="cat-tag">{inc.category}</span>
        <span className="pair">
          <Users />
          <strong>{inc.estimated_people_affected ?? 0}</strong>
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
  const [tab, setTab] = useState('unassigned');

  const byNewest = (a, b) =>
    new Date(b.created_at || 0) - new Date(a.created_at || 0);

  const unassigned = incidents
    .filter((inc) => inc.status === 'reported' || inc.status === 'triaged')
    .sort(byNewest);

  const assigned = incidents
    .filter((inc) => inc.status === 'assigned' || inc.status === 'in_progress')
    .sort(byNewest);

  // Auto-switch tab when the selected incident belongs to the other tab
  useEffect(() => {
    if (!selectedId) return;
    if (tab === 'unassigned' && assigned.some((i) => i._id === selectedId)) setTab('assigned');
    if (tab === 'assigned' && unassigned.some((i) => i._id === selectedId)) setTab('unassigned');
  }, [selectedId]); // eslint-disable-line

  const list = tab === 'unassigned' ? unassigned : assigned;

  return (
    <aside className="feed-region card">
      <div className="feed-header">
        <div className="title-block">
          <div className="icon-bubble" aria-hidden="true">
            <Radio strokeWidth={2.2} />
          </div>
          <div>
            <h2>Live Feed</h2>
            <div className="subtitle">Newest first</div>
          </div>
        </div>
        <span className="count">{unassigned.length + assigned.length} active</span>
      </div>

      {/* Tab bar */}
      <div className="feed-tabs">
        <button
          type="button"
          className={`feed-tab ${tab === 'unassigned' ? 'active' : ''}`}
          onClick={() => setTab('unassigned')}
        >
          <span className="feed-tab-label">Unassigned</span>
          {unassigned.length > 0 && (
            <span className="feed-tab-count unassigned">{unassigned.length}</span>
          )}
        </button>
        <button
          type="button"
          className={`feed-tab ${tab === 'assigned' ? 'active' : ''}`}
          onClick={() => setTab('assigned')}
        >
          <span className="feed-tab-label">Assigned</span>
          {assigned.length > 0 && (
            <span className="feed-tab-count assigned">{assigned.length}</span>
          )}
        </button>
      </div>

      <div className="feed-list">
        {list.length === 0 ? (
          <div className="feed-empty">
            <div className="icon">
              <Inbox />
            </div>
            {tab === 'unassigned'
              ? 'No unassigned incidents.'
              : 'No assigned incidents yet.'}
          </div>
        ) : (
          list.map((inc) =>
            tab === 'unassigned' ? (
              <UnassignedCard
                key={inc._id}
                inc={inc}
                active={selectedId === inc._id}
                onSelect={onSelect}
              />
            ) : (
              <AssignedCard
                key={inc._id}
                inc={inc}
                active={selectedId === inc._id}
                onSelect={onSelect}
              />
            )
          )
        )}
      </div>
    </aside>
  );
}
