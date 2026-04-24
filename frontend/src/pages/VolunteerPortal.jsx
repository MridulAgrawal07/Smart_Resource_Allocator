import { useCallback, useEffect, useState } from 'react';
import {
  UserCheck,
  MapPin,
  Clock,
  Shield,
  Heart,
  CheckCircle,
  AlertTriangle,
  Navigation,
  Loader,
  Inbox,
  Users,
  Zap,
  ArrowLeft,
  Briefcase,
} from 'lucide-react';
import { fetchVolunteers, fetchIncidents, confirmAssignment } from '../api';
import { scoreBand, formatScore, formatRelative } from '../util';

// ── Roster card — one clickable tile per volunteer ─────────────────
function RosterCard({ vol, onSelect }) {
  const resting = vol.mandatory_rest_until && new Date(vol.mandatory_rest_until) > new Date();
  const statusKey = resting ? 'resting' : (vol.current_status || 'offline');
  const STATUS_LABEL = { available: 'Available', assigned: 'Deployed', resting: 'Resting', offline: 'Offline' };

  return (
    <button type="button" className={`vol-roster-card ${statusKey}`} onClick={() => onSelect(vol)}>
      <div className="vol-roster-card-top">
        <div className="vol-roster-avatar">{vol.name[0]}</div>
        <span className={`vol-status-pill ${statusKey}`}>
          <span className="dot" />
          {STATUS_LABEL[statusKey] || statusKey}
        </span>
      </div>
      <div className="vol-roster-name">{vol.name}</div>
      {vol.skills?.length > 0 && (
        <div className="vol-roster-skills">{vol.skills.slice(0, 3).join(' · ')}</div>
      )}
      {statusKey === 'assigned' && (
        vol.active_incident ? (
          <div className="vol-mission-box">
            <span className="vol-mission-label">Current Mission</span>
            <p className="vol-mission-text">
              {vol.active_incident.summarized_need || '—'}
            </p>
            <span className="vol-mission-cat">{vol.active_incident.category}</span>
          </div>
        ) : (
          <div className="vol-mission-box vol-mission-box--unknown">
            <span className="vol-mission-label">Current Mission</span>
            <p className="vol-mission-text">Mission details not on file</p>
          </div>
        )
      )}
      {statusKey === 'resting' && vol.wellness_flags?.length > 0 && (
        <div className="vol-mission-box vol-mission-box--rest">
          <span className="vol-mission-label">Wellness Note</span>
          <p className="vol-mission-text">{vol.wellness_flags[0].reason}</p>
        </div>
      )}
    </button>
  );
}

// ── Roster view — shown when no volunteer is selected ──────────────
function RosterView({ volunteers, onSelect }) {
  const available = volunteers.filter((v) => v.current_status !== 'assigned');
  const deployed  = volunteers.filter((v) => v.current_status === 'assigned');

  return (
    <div className="vol-portal">
      <div className="vol-selector-section">
        <div className="vol-selector-header">
          <div className="vol-selector-icon">
            <Users size={22} strokeWidth={2} />
          </div>
          <div>
            <h1>Volunteer Roster</h1>
            <p>Select your profile to access your mission briefing</p>
          </div>
        </div>
      </div>

      <div className="vol-roster">
        {/* Available on Standby */}
        <section className="vol-roster-section">
          <h3 className="vol-roster-section-title">
            <span className="vol-section-status-dot available" />
            Available on Standby
            <span className="vol-section-count">{available.length}</span>
          </h3>
          {available.length === 0 ? (
            <div className="vol-roster-empty">All volunteers are currently deployed</div>
          ) : (
            <div className="vol-roster-grid">
              {available.map((v) => (
                <RosterCard key={v._id} vol={v} onSelect={onSelect} />
              ))}
            </div>
          )}
        </section>

        {/* Deployed / Active Missions */}
        {deployed.length > 0 && (
          <section className="vol-roster-section">
            <h3 className="vol-roster-section-title">
              <span className="vol-section-status-dot assigned" />
              Deployed / Active Missions
              <span className="vol-section-count">{deployed.length}</span>
            </h3>
            <div className="vol-roster-grid vol-roster-grid--full">
              {deployed.map((v) => (
                <RosterCard key={v._id} vol={v} onSelect={onSelect} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────
export default function VolunteerPortal() {
  const [volunteers, setVolunteers] = useState([]);
  const [active, setActive]         = useState(null);
  const [incidents, setIncidents]   = useState([]);
  const [loadState, setLoadState]   = useState('loading');
  const [checkedIn, setCheckedIn]   = useState(new Set());
  const [assigning, setAssigning]   = useState(null);

  const refresh = useCallback(async () => {
    try {
      const [vRes, iRes] = await Promise.all([fetchVolunteers(), fetchIncidents()]);
      setVolunteers(vRes.volunteers || []);
      setIncidents(iRes.incidents || []);
      setActive((prev) => {
        if (!prev) return null;
        return (vRes.volunteers || []).find((v) => v._id === prev._id) || prev;
      });
      setLoadState('ready');
    } catch (err) {
      console.error(err);
      setLoadState((prev) => (prev === 'ready' ? 'ready' : 'error'));
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 10_000);
    return () => clearInterval(id);
  }, [refresh]);

  const handleCheckin = (incId) => setCheckedIn((prev) => new Set(prev).add(incId));

  const handleAssign = useCallback(async (incId) => {
    if (!active) return;
    setAssigning(incId);
    try {
      await confirmAssignment(incId, [active._id]);
      await refresh();
    } catch (err) {
      console.error(err);
    }
    setAssigning(null);
  }, [active, refresh]);

  // ── Loading ──────────────────────────────────────────────────────
  if (loadState === 'loading') {
    return (
      <div className="vol-portal">
        <div className="vol-loading">
          <Loader size={24} className="field-spin" />
          <span>Loading volunteer data…</span>
        </div>
      </div>
    );
  }

  // ── Roster (no volunteer selected) ───────────────────────────────
  if (!active) {
    return <RosterView volunteers={volunteers} onSelect={setActive} />;
  }

  // ── Mission briefing (volunteer selected) ────────────────────────
  const myAssignments = incidents.filter(
    (inc) =>
      inc.status === 'assigned' &&
      Array.isArray(inc.assigned_volunteer_ids) &&
      inc.assigned_volunteer_ids.includes(String(active._id))
  );

  const available = incidents.filter(
    (inc) => inc.status === 'reported' || inc.status === 'triaged'
  );

  return (
    <div className="vol-portal">
      {/* Back to roster */}
      <div className="vol-back-bar">
        <button type="button" className="vol-back-btn" onClick={() => setActive(null)}>
          <ArrowLeft size={14} strokeWidth={2.2} />
          Back to Roster
        </button>
      </div>

      {/* Profile card */}
      <div className="vol-profile-card">
        <div className="vol-profile-top">
          <div className="vol-profile-avatar">{active.name[0]}</div>
          <div className="vol-profile-info">
            <h2>{active.name}</h2>
            <div className="vol-profile-status">
              <span
                className={`vol-status-dot ${
                  active.mandatory_rest_until && new Date(active.mandatory_rest_until) > new Date()
                    ? 'resting'
                    : active.current_status
                }`}
              />
              {active.mandatory_rest_until && new Date(active.mandatory_rest_until) > new Date()
                ? 'Mandatory Rest'
                : active.current_status}
            </div>
          </div>
        </div>
        <div className="vol-profile-stats">
          <div className="vol-stat">
            <Shield size={14} />
            <span className="vol-stat-label">Trust</span>
            <span className="vol-stat-val">{(active.trust_score * 100).toFixed(0)}%</span>
          </div>
          <div className="vol-stat">
            <Heart size={14} />
            <span className="vol-stat-label">Wellness</span>
            <span className="vol-stat-val">{(active.wellness_score * 100).toFixed(0)}%</span>
          </div>
          <div className="vol-stat">
            <Clock size={14} />
            <span className="vol-stat-label">Hours (7d)</span>
            <span className="vol-stat-val">{active.hours_last_7_days}h</span>
          </div>
          <div className="vol-stat">
            <Zap size={14} />
            <span className="vol-stat-label">Completed</span>
            <span className="vol-stat-val">{active.total_resolved || 0}</span>
          </div>
        </div>
        {active.skills?.length > 0 && (
          <div className="vol-skills-row">
            {active.skills.map((s) => (
              <span key={s} className="vol-skill-chip">{s}</span>
            ))}
          </div>
        )}
        {active.wellness_flags?.length > 0 && (
          <div className="vol-wellness-alert">
            <AlertTriangle size={14} />
            <span>{active.wellness_flags[0].reason}</span>
          </div>
        )}
      </div>

      {/* My Assignments */}
      <section className="vol-section">
        <h3 className="vol-section-title">
          <Navigation size={15} />
          My Assignments
          <span className="vol-section-count">{myAssignments.length}</span>
        </h3>
        {myAssignments.length === 0 ? (
          <div className="vol-empty">
            <Inbox size={24} />
            <span>No active assignments</span>
          </div>
        ) : (
          <div className="vol-cards">
            {myAssignments.map((inc) => {
              const band = scoreBand(inc.impact_score);
              const done = checkedIn.has(inc._id);
              return (
                <div key={inc._id} className={`vol-task-card ${band}`}>
                  <div className="vol-task-top">
                    <span className={`urgency-badge ${band}`}>
                      <span className="dot" />
                      {band === 'crit' ? 'Critical' : band === 'warn' ? 'Elevated' : 'Routine'}
                    </span>
                    <span className="vol-task-score">{formatScore(inc.impact_score)}</span>
                  </div>
                  <p className="vol-task-need">{inc.summarized_need}</p>
                  <div className="vol-task-meta">
                    <span className="vol-task-cat">{inc.category}</span>
                    <span className="vol-task-time">
                      <Clock size={11} />
                      {formatRelative(inc.last_updated_at || inc.created_at)}
                    </span>
                    {inc.estimated_people_affected > 0 && (
                      <span className="vol-task-people">
                        <Users size={11} />
                        {inc.estimated_people_affected}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    className={`vol-checkin-btn ${done ? 'done' : ''}`}
                    onClick={() => handleCheckin(inc._id)}
                    disabled={done}
                  >
                    {done ? (
                      <><CheckCircle size={16} /> Checked In</>
                    ) : (
                      <><MapPin size={16} /> Geo-Verified Check-in</>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Available incidents to self-assign */}
      <section className="vol-section">
        <h3 className="vol-section-title">
          <Briefcase size={15} />
          Available Incidents
          <span className="vol-section-count">{available.length}</span>
        </h3>
        {available.length === 0 ? (
          <div className="vol-empty">
            <CheckCircle size={24} />
            <span>All incidents are covered</span>
          </div>
        ) : (
          <div className="vol-cards">
            {available.slice(0, 6).map((inc) => {
              const band = scoreBand(inc.impact_score);
              return (
                <div key={inc._id} className={`vol-task-card ${band}`}>
                  <div className="vol-task-top">
                    <span className={`urgency-badge ${band}`}>
                      <span className="dot" />
                      {band === 'crit' ? 'Critical' : band === 'warn' ? 'Elevated' : 'Routine'}
                    </span>
                    <span className="vol-task-score">{formatScore(inc.impact_score)}</span>
                  </div>
                  <p className="vol-task-need">{inc.summarized_need}</p>
                  <div className="vol-task-meta">
                    <span className="vol-task-cat">{inc.category}</span>
                  </div>
                  <button
                    type="button"
                    className="vol-assign-btn"
                    onClick={() => handleAssign(inc._id)}
                    disabled={assigning === inc._id}
                  >
                    {assigning === inc._id ? (
                      <><Loader size={14} className="field-spin" /> Matching…</>
                    ) : (
                      <><UserCheck size={14} /> Run Smart Match</>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
