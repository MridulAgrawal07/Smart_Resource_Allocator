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
  Flag,
} from 'lucide-react';
import { fetchVolunteers, fetchIncidents, confirmAssignment, geoCheckin, completeTask } from '../api';
import { scoreBand, formatScore, formatRelative } from '../util';
import { showToast } from '../components/Toast';

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
  const [taskStates, setTaskStates] = useState({}); // { [incId]: { phase, msg } }
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

  // Clear all in-flight UI state whenever the active volunteer changes.
  // Without this, taskStates keyed by incidentId would bleed across
  // volunteers — Volunteer A's "on-site" phase would appear for Volunteer B.
  useEffect(() => {
    setTaskStates({});
  }, [active?._id]);

  const setTaskPhase = useCallback((incId, phase, msg = '') => {
    setTaskStates((prev) => ({ ...prev, [incId]: { phase, msg } }));
  }, []);

  // Step 1: geo-verify arrival — transitions idle → locating → verifying → idle,
  // then awaits refresh() so checked_in_volunteer_ids comes back from the server
  // before re-render. isOnSite is derived from that server data, never local state.
  const handleCheckin = useCallback((inc) => {
    const incId = inc._id;
    setTaskPhase(incId, 'locating');

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        console.log('[geo-checkin] coordinates acquired:', { latitude, longitude, accuracy: pos.coords.accuracy });

        setTaskPhase(incId, 'verifying');

        const payload = { incidentId: incId, volunteerId: active._id, lat: latitude, lng: longitude };
        console.log('[geo-checkin] sending payload:', payload);

        try {
          const result = await geoCheckin(incId, active._id, latitude, longitude);
          console.log('[geo-checkin] backend response:', result);

          // Await the refresh so checked_in_volunteer_ids is in state before
          // we clear the spinner — without await the button would flash back to
          // "Geo-Verified Check-in" for one render cycle.
          setTaskPhase(incId, 'idle');
          await refresh();
          console.log('[geo-checkin] incidents refreshed — isOnSite should now be true for', active.name);
          showToast(`Geo check-in confirmed — ${Math.round(result.distance_m)}m from site`, 'success', 3000);
        } catch (err) {
          console.error('[geo-checkin] backend error:', err.message);
          setTaskPhase(incId, 'error', err.message || 'Verification failed');
          showToast(err.message || 'Geo check-in failed', 'error', 5000);
          setTimeout(() => setTaskPhase(incId, 'idle'), 4500);
        }
      },
      (geoErr) => {
        console.error('[geo-checkin] geolocation error:', geoErr.code, geoErr.message);
        const msg = geoErr.code === 1 ? 'Location access denied — please allow location in browser settings'
                  : geoErr.code === 2 ? 'Location unavailable — check device GPS'
                  : 'Location request timed out';
        setTaskPhase(incId, 'error', msg);
        showToast(msg, 'error', 5000);
        setTimeout(() => setTaskPhase(incId, 'idle'), 4500);
      },
      { enableHighAccuracy: true, timeout: 10_000 }
    );
  }, [active, refresh, setTaskPhase]);

  // Step 2: resolve the incident — backend releases all assigned volunteers
  const handleComplete = useCallback(async (incId) => {
    console.log('[complete-task] marking complete:', { incidentId: incId, volunteerId: active._id });
    setTaskPhase(incId, 'completing');
    try {
      const result = await completeTask(incId, active._id);
      console.log('[complete-task] backend response:', result);
      setTaskPhase(incId, 'done');
      showToast(`Mission complete — ${result.heroes?.length ?? 0} volunteer(s) credited`, 'success', 4000);
      setTimeout(() => refresh(), 1800);
    } catch (err) {
      console.error('[complete-task] error:', err.message);
      // Reset to idle — server-derived isOnSite still shows the green button
      // because the volunteer remains in checked_in_volunteer_ids
      setTaskPhase(incId, 'error', err.message || 'Could not complete task');
      showToast(err.message || 'Could not complete task', 'error', 5000);
      setTimeout(() => setTaskPhase(incId, 'idle'), 4500);
    }
  }, [active, refresh, setTaskPhase]);

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
      (inc.status === 'assigned' || inc.status === 'in_progress') &&
      Array.isArray(inc.assigned_volunteer_ids) &&
      inc.assigned_volunteer_ids.some((id) => String(id) === String(active._id))
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
              const ts = taskStates[inc._id] || { phase: 'idle', msg: '' };

              // Derived from server data — scoped to the active volunteer's ID.
              // This is the only correct way to determine on-site status:
              // local state is volunteer-agnostic (keyed by incidentId only),
              // so it would bleed across volunteers sharing the same incident.
              const isOnSite = Array.isArray(inc.checked_in_volunteer_ids) &&
                inc.checked_in_volunteer_ids.some((id) => String(id) === String(active._id));

              const checkinBusy = ts.phase === 'locating' || ts.phase === 'verifying';
              const completing  = ts.phase === 'completing';
              const done        = ts.phase === 'done';

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

                  {/* ── Step 1: Geo check-in ── */}
                  <button
                    type="button"
                    className={`vol-checkin-btn ${
                      isOnSite || completing || done ? 'on-site'
                      : ts.phase === 'error'        ? 'error'
                      : ''
                    }`}
                    onClick={() => !checkinBusy && !isOnSite && handleCheckin(inc)}
                    disabled={checkinBusy || isOnSite || completing || done}
                  >
                    {ts.phase === 'locating'         && <><Loader size={16} className="field-spin" /> Getting location…</>}
                    {ts.phase === 'verifying'        && <><Loader size={16} className="field-spin" /> Verifying on-site…</>}
                    {ts.phase === 'error'            && <><AlertTriangle size={16} /> {ts.msg}</>}
                    {(isOnSite || completing || done) && <><CheckCircle size={16} /> On-Site Verified</>}
                    {!checkinBusy && !isOnSite && ts.phase !== 'error' && <><MapPin size={16} /> Geo-Verified Check-in</>}
                  </button>

                  {/* ── Step 2: Complete — gated on server-confirmed arrival ── */}
                  {(isOnSite && !done) && (
                    <button
                      type="button"
                      className="vol-complete-btn"
                      onClick={() => !completing && handleComplete(inc._id)}
                      disabled={completing}
                    >
                      {completing ? (
                        <><Loader size={16} className="field-spin" /> Completing…</>
                      ) : (
                        <><Flag size={16} /> Mark Mission Complete</>
                      )}
                    </button>
                  )}

                  {done && (
                    <div className="vol-task-resolved">
                      <CheckCircle size={13} />
                      Mission resolved — all volunteers freed
                    </div>
                  )}
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
