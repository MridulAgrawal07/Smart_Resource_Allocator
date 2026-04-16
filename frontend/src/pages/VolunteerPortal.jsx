import { useCallback, useEffect, useState } from 'react';
import {
  UserCheck,
  MapPin,
  Clock,
  Shield,
  Heart,
  CheckCircle,
  AlertTriangle,
  ChevronDown,
  Navigation,
  Loader,
  Inbox,
  Users,
  Zap,
} from 'lucide-react';
import { fetchVolunteers, fetchIncidents, assignIncident } from '../api';
import { scoreBand, formatScore, formatRelative } from '../util';

export default function VolunteerPortal() {
  const [volunteers, setVolunteers] = useState([]);
  const [active, setActive] = useState(null); // selected volunteer
  const [dropOpen, setDropOpen] = useState(false);
  const [incidents, setIncidents] = useState([]);
  const [loadState, setLoadState] = useState('loading');
  const [checkedIn, setCheckedIn] = useState(new Set());
  const [assigning, setAssigning] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const [vRes, iRes] = await Promise.all([fetchVolunteers(), fetchIncidents()]);
      setVolunteers(vRes.volunteers || []);
      setIncidents(iRes.incidents || []);
      // Keep the active volunteer profile in sync with refreshed data
      setActive((prev) => {
        if (!prev) return null;
        const updated = (vRes.volunteers || []).find((v) => v._id === prev._id);
        return updated || prev;
      });
      setLoadState('ready');
    } catch (err) {
      console.error(err);
      setLoadState((prev) => (prev === 'ready' ? 'ready' : 'error'));
    }
  }, []);

  // Load volunteers + incidents on mount, then poll every 10s
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 10_000);
    return () => clearInterval(id);
  }, [refresh]);

  const handleSelect = (vol) => {
    setActive(vol);
    setDropOpen(false);
  };

  const handleCheckin = (incId) => {
    setCheckedIn((prev) => new Set(prev).add(incId));
  };

  const handleAssign = useCallback(async (incId) => {
    setAssigning(incId);
    try {
      await assignIncident(incId);
      await refresh();
    } catch (err) {
      console.error(err);
    }
    setAssigning(null);
  }, [refresh]);

  // Filter incidents that are assigned to this volunteer, or show unassigned ones they could pick up
  const myAssignments = active
    ? incidents.filter(
        (inc) =>
          inc.status === 'assigned' &&
          Array.isArray(inc.assigned_volunteer_ids) &&
          inc.assigned_volunteer_ids.includes(String(active._id))
      )
    : [];

  const available = incidents.filter(
    (inc) => inc.status === 'reported' || inc.status === 'triaged'
  );

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

  return (
    <div className="vol-portal">
      {/* Volunteer selector */}
      <div className="vol-selector-section">
        <div className="vol-selector-header">
          <div className="vol-selector-icon">
            <UserCheck size={22} strokeWidth={2} />
          </div>
          <div>
            <h1>Volunteer Portal</h1>
            <p>Your mission briefing and task management</p>
          </div>
        </div>

        <div className="vol-dropdown-wrap">
          <button
            type="button"
            className={`vol-dropdown-trigger ${dropOpen ? 'open' : ''}`}
            onClick={() => setDropOpen(!dropOpen)}
          >
            {active ? (
              <span className="vol-dropdown-chosen">
                <span className="vol-avatar">{active.name[0]}</span>
                {active.name}
              </span>
            ) : (
              <span className="vol-dropdown-placeholder">Select your profile…</span>
            )}
            <ChevronDown size={16} />
          </button>
          {dropOpen && (
            <div className="vol-dropdown-list">
              {volunteers.map((v) => {
                const resting =
                  v.mandatory_rest_until && new Date(v.mandatory_rest_until) > new Date();
                return (
                  <button
                    key={v._id}
                    type="button"
                    className={`vol-dropdown-item ${active?._id === v._id ? 'selected' : ''} ${resting ? 'resting' : ''}`}
                    onClick={() => handleSelect(v)}
                  >
                    <span className="vol-avatar">{v.name[0]}</span>
                    <div className="vol-dropdown-item-info">
                      <span className="vol-dropdown-item-name">{v.name}</span>
                      <span className="vol-dropdown-item-skills">
                        {v.skills?.slice(0, 3).join(' · ')}
                      </span>
                    </div>
                    {resting && (
                      <span className="vol-rest-badge">
                        <Heart size={10} /> Resting
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Profile card */}
      {active && (
        <div className="vol-profile-card">
          <div className="vol-profile-top">
            <div className="vol-profile-avatar">{active.name[0]}</div>
            <div className="vol-profile-info">
              <h2>{active.name}</h2>
              <div className="vol-profile-status">
                <span
                  className={`vol-status-dot ${
                    active.mandatory_rest_until &&
                    new Date(active.mandatory_rest_until) > new Date()
                      ? 'resting'
                      : active.current_status
                  }`}
                />
                {active.mandatory_rest_until &&
                new Date(active.mandatory_rest_until) > new Date()
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
      )}

      {/* My Assignments */}
      {active && (
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
                        <>
                          <CheckCircle size={16} />
                          Checked In
                        </>
                      ) : (
                        <>
                          <MapPin size={16} />
                          Geo-Verified Check-in
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Available incidents to pick up */}
      {active && (
        <section className="vol-section">
          <h3 className="vol-section-title">
            <Zap size={15} />
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
                        <>
                          <Loader size={14} className="field-spin" />
                          Matching…
                        </>
                      ) : (
                        <>
                          <UserCheck size={14} />
                          Run Smart Match
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
