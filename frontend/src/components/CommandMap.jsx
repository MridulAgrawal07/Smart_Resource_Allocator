import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Map as MapIcon, Zap, Loader, CheckCircle, UserCheck, AlertTriangle, Maximize2, Minimize2 } from 'lucide-react';
import { scoreBand, formatScore, formatRelative, latLngFromIncident } from '../util';
import { fetchMatches, confirmAssignment } from '../api';
import { showToast } from './Toast';

function makePinIcon(band) {
  return L.divIcon({
    className: 'pin-wrap',
    html: `<div class="pin ${band}"><div class="core"></div></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -10],
  });
}

const ICONS = {
  crit: makePinIcon('crit'),
  warn: makePinIcon('warn'),
  nominal: makePinIcon('nominal'),
};

const BREAKDOWN_ROWS = [
  { key: 'severity', label: 'Severity', weightKey: 'severity', cls: 'severity' },
  { key: 'people_factor', label: 'People', weightKey: 'people', cls: 'people' },
  { key: 'vulnerability_multiplier', label: 'Vulnerability', weightKey: 'vulnerability', cls: 'vuln' },
  { key: 'time_decay', label: 'Time decay', weightKey: 'decay', cls: 'decay' },
  { key: 'resource_scarcity', label: 'Scarcity', weightKey: 'scarcity', cls: 'scarcity' },
  { key: 'historical_pattern', label: 'History', weightKey: 'history', cls: 'history' },
];

function BreakdownBars({ breakdown }) {
  if (!breakdown) return null;
  const weights = breakdown.weights || {};
  return (
    <div className="bars">
      {BREAKDOWN_ROWS.map((row) => {
        const raw = Number(breakdown[row.key]) || 0;
        const w = Number(weights[row.weightKey]) || 0;
        const contribution = raw * w;
        const pct = Math.max(0, Math.min(1, raw)) * 100;
        return (
          <div key={row.key} className={`bar ${row.cls}`}>
            <span className="name">{row.label}</span>
            <span className="track">
              <span className="fill" style={{ width: `${pct}%` }} />
            </span>
            <span className="val">{contribution.toFixed(2)}</span>
          </div>
        );
      })}
    </div>
  );
}

function IncidentPopup({ inc, onAssigned }) {
  const band = scoreBand(inc.impact_score);
  // idle | loading | selecting | confirming | done | error | no-match
  const [matchState, setMatchState] = useState('idle');
  const [candidates, setCandidates] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [result, setResult] = useState(null);
  const [localStatus, setLocalStatus] = useState(inc.status);

  const alreadyAssigned = localStatus === 'assigned' || localStatus === 'in_progress';

  const handleMatch = async (e) => {
    e.stopPropagation();
    setMatchState('loading');
    try {
      const res = await fetchMatches(inc._id);
      if (!res.candidates || res.candidates.length === 0) {
        setMatchState('no-match');
        showToast('No eligible volunteers found for this incident', 'error');
        return;
      }
      setCandidates(res.candidates);
      setSelected(new Set());
      setMatchState('selecting');
    } catch (err) {
      console.error('[match]', err);
      setMatchState('error');
      showToast('Smart match failed — please try again', 'error');
      setTimeout(() => setMatchState('idle'), 2500);
    }
  };

  const toggleVolunteer = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleConfirm = async (e) => {
    e.stopPropagation();
    setMatchState('confirming');
    try {
      const res = await confirmAssignment(inc._id, [...selected]);
      setResult(res);
      setMatchState('done');
      setLocalStatus('assigned');
      const names = res.assigned.map((a) => a.name).join(', ');
      showToast(`Assigned: ${names}`);
      if (onAssigned) onAssigned(inc._id, res);
    } catch (err) {
      console.error('[confirm]', err);
      showToast('Assignment failed — please try again', 'error');
      setMatchState('selecting');
    }
  };

  return (
    <div className="popup">
      <div className="head">
        <span className="cat-badge">{inc.category}</span>
        <span className={`status-badge ${localStatus}`}>{localStatus}</span>
        <span className="when">
          {formatRelative(inc.last_updated_at || inc.created_at)}
        </span>
      </div>
      <p className="need">{inc.summarized_need}</p>

      <div className="score-headline">
        <span className={`score-num ${band}`}>{formatScore(inc.impact_score)}</span>
        <span className="score-meta">
          <strong>Impact Score</strong>
          composite · 0–1
        </span>
      </div>

      <div className="meta-row">
        <div className="item">
          <span className="k">Severity</span>
          <span className="v">{inc.severity ?? '—'} / 10</span>
        </div>
        <div className="item">
          <span className="k">People affected</span>
          <span className="v">{inc.estimated_people_affected ?? 0}</span>
        </div>
        <div className="item">
          <span className="k">Source reports</span>
          <span className="v">{inc.contributing_count ?? 0}</span>
        </div>
        <div className="item">
          <span className="k">Status</span>
          <span className="v" style={{ textTransform: 'capitalize' }}>{localStatus}</span>
        </div>
      </div>

      <div className="breakdown-h">
        <span>Score breakdown</span>
        <span className="help">weighted contribution</span>
      </div>
      <BreakdownBars breakdown={inc.score_breakdown} />

      {/* ── Smart Match Action ── */}
      <div className="popup-action">

        {/* ── idle: not yet assigned ── */}
        {matchState === 'idle' && !alreadyAssigned && (
          <button type="button" className="match-btn" onClick={handleMatch}>
            <Zap size={14} strokeWidth={2.4} />
            Run Smart Match
          </button>
        )}

        {/* ── idle: already assigned ── */}
        {matchState === 'idle' && alreadyAssigned && !result && (
          <div className="match-assigned-note">
            <CheckCircle size={13} />
            Volunteer already assigned
          </div>
        )}

        {/* ── fetching candidates ── */}
        {matchState === 'loading' && (
          <button type="button" className="match-btn loading" disabled>
            <Loader size={14} className="field-spin" />
            Finding best matches…
          </button>
        )}

        {/* ── error ── */}
        {matchState === 'error' && (
          <div className="match-error">
            <AlertTriangle size={13} />
            Match failed — try again
          </div>
        )}

        {/* ── no volunteers found ── */}
        {matchState === 'no-match' && (
          <div className="match-error">
            <AlertTriangle size={13} />
            No eligible volunteers found
          </div>
        )}

        {/* ── select phase: checkbox list ── */}
        {(matchState === 'selecting' || matchState === 'confirming') && (
          <div className="match-select">
            <div className="match-select-header">
              <span>Select volunteers to assign</span>
              <span className="match-select-hint">{selected.size} selected</span>
            </div>
            <div className="match-select-list">
              {candidates.map((c, i) => {
                const id = String(c.volunteer_id);
                const checked = selected.has(id);
                return (
                  <label
                    key={id}
                    className={`match-option ${checked ? 'checked' : ''}`}
                    style={{ animationDelay: `${i * 60}ms` }}
                  >
                    <input
                      type="checkbox"
                      className="match-checkbox"
                      checked={checked}
                      onChange={() => toggleVolunteer(id)}
                    />
                    <span className="match-option-check" aria-hidden="true" />
                    <span className="match-option-info">
                      <span className="match-option-name">{c.name}</span>
                      <span className="match-option-score">
                        {(c.matchScore * 100).toFixed(0)}% match
                      </span>
                    </span>
                    {i === 0 && <span className="match-top-badge">Top pick</span>}
                  </label>
                );
              })}
            </div>
            <button
              type="button"
              className="match-confirm-btn"
              onClick={handleConfirm}
              disabled={selected.size === 0 || matchState === 'confirming'}
            >
              {matchState === 'confirming' ? (
                <>
                  <Loader size={13} className="field-spin" />
                  Confirming…
                </>
              ) : (
                <>
                  <UserCheck size={13} strokeWidth={2.4} />
                  Confirm Assignment{selected.size > 1 ? ` (${selected.size})` : ''}
                </>
              )}
            </button>
          </div>
        )}

        {/* ── done: confirmed ── */}
        {matchState === 'done' && result && (
          <div className="match-result">
            <div className="match-result-header">
              <CheckCircle size={13} />
              <span>Assignment confirmed</span>
            </div>
            {result.assigned.map((a, i) => (
              <div
                key={String(a.volunteer_id)}
                className={`match-candidate top`}
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <UserCheck size={13} />
                <span className="match-name">{a.name}</span>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}

function FitToMarkers({ points }) {
  const map = useMap();
  useMemo(() => {
    if (!points.length) return;
    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds, { padding: [60, 60], maxZoom: 13 });
  }, [points.map((p) => p.join(',')).join('|')]); // eslint-disable-line
  return null;
}

function MapSizer({ isMaximized }) {
  const map = useMap();
  useEffect(() => {
    // After the CSS transition ends, tell Leaflet the container resized
    const timer = setTimeout(() => map.invalidateSize(), 320);
    return () => clearTimeout(timer);
  }, [isMaximized, map]);
  return null;
}

function FlyToSelected({ selectedId, markerRefs, visible }) {
  const map = useMap();
  useEffect(() => {
    if (!selectedId) return;
    const entry = visible.find((x) => x.inc._id === selectedId);
    if (!entry) return;
    map.flyTo(entry.ll, 15, { duration: 0.8 });
    // Open the popup after the fly animation settles
    const timer = setTimeout(() => {
      const marker = markerRefs.current.get(selectedId);
      if (marker) marker.openPopup();
    }, 850);
    return () => clearTimeout(timer);
  }, [selectedId]); // eslint-disable-line
  return null;
}

export default function CommandMap({ incidents, selectedId, onSelect, onAssigned, isMaximized, onToggleMaximize, isDarkMode }) {
  const markerRefs = useRef(new Map());

  const setMarkerRef = useCallback((id, ref) => {
    if (ref) {
      markerRefs.current.set(id, ref);
    } else {
      markerRefs.current.delete(id);
    }
  }, []);

  const visible = incidents
    .map((inc) => ({ inc, ll: latLngFromIncident(inc) }))
    .filter((x) => x.ll);

  const points = visible.map((x) => x.ll);

  return (
    <section className={`map-region card${isMaximized ? ' map-maximized' : ''}`}>
      <div className="map-head">
        <div className="title">
          <div className="icon-bubble" aria-hidden="true">
            <MapIcon strokeWidth={2.2} />
          </div>
          <div>
            <h2>Field Overview</h2>
            <div className="subtitle">{visible.length} pinned incidents</div>
          </div>
        </div>
        <div className="map-head-right">
          <div className="map-legend" role="list">
            <div className="row" role="listitem">
              <span className="dot" style={{ background: 'var(--critical)' }} />
              Critical
            </div>
            <div className="row" role="listitem">
              <span className="dot" style={{ background: 'var(--elevated)' }} />
              Elevated
            </div>
            <div className="row" role="listitem">
              <span className="dot" style={{ background: 'var(--nominal)' }} />
              Routine
            </div>
          </div>
          <button
            type="button"
            className="map-maximize-btn"
            onClick={onToggleMaximize}
            title={isMaximized ? 'Exit full screen' : 'Expand map'}
          >
            {isMaximized
              ? <Minimize2 size={15} strokeWidth={2.2} />
              : <Maximize2 size={15} strokeWidth={2.2} />}
          </button>
        </div>
      </div>

      <div className="map-canvas">
        <MapContainer
          center={[20, 78]}
          zoom={4}
          zoomControl={true}
          scrollWheelZoom={true}
          worldCopyJump={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url={isDarkMode
              ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
              : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'}
            subdomains="abcd"
            maxZoom={19}
          />

          {points.length > 0 && <FitToMarkers points={points} />}
          <FlyToSelected selectedId={selectedId} markerRefs={markerRefs} visible={visible} />
          <MapSizer isMaximized={isMaximized} />

          {visible.map(({ inc, ll }) => {
            const band = scoreBand(inc.impact_score);
            return (
              <Marker
                key={inc._id}
                position={ll}
                icon={ICONS[band]}
                ref={(ref) => setMarkerRef(inc._id, ref)}
                eventHandlers={{
                  click: () => onSelect && onSelect(inc._id),
                }}
              >
                <Popup maxWidth={340} minWidth={280} closeOnClick={false} autoPan={true}>
                  <IncidentPopup inc={inc} onAssigned={onAssigned} />
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>
    </section>
  );
}
