import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Map as MapIcon, Zap, Loader, CheckCircle, UserCheck, AlertTriangle } from 'lucide-react';
import { scoreBand, formatScore, formatRelative, latLngFromIncident } from '../util';
import { assignIncident } from '../api';
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
  const [matchState, setMatchState] = useState('idle'); // idle | loading | done | error | no-match
  const [result, setResult] = useState(null);
  const [localStatus, setLocalStatus] = useState(inc.status);

  const handleMatch = async (e) => {
    e.stopPropagation(); // prevent Leaflet from interpreting as map click
    setMatchState('loading');
    try {
      const res = await assignIncident(inc._id);
      if (!res.assigned && (!res.candidates || res.candidates.length === 0)) {
        setMatchState('no-match');
        showToast('No eligible volunteers found for this incident', 'error');
        return;
      }
      setResult(res);
      setMatchState('done');
      setLocalStatus('assigned');
      showToast(`Match successful: ${res.assigned.name} assigned!`);
      if (onAssigned) onAssigned(inc._id, res);
    } catch (err) {
      console.error('[match]', err);
      setMatchState('error');
      showToast('Smart match failed — please try again', 'error');
      setTimeout(() => setMatchState('idle'), 2500);
    }
  };

  const alreadyAssigned = localStatus === 'assigned' || localStatus === 'in_progress';

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
        {matchState === 'idle' && !alreadyAssigned && (
          <button type="button" className="match-btn" onClick={handleMatch}>
            <Zap size={14} strokeWidth={2.4} />
            Run Smart Match
          </button>
        )}
        {matchState === 'idle' && alreadyAssigned && !result && (
          <div className="match-assigned-note">
            <CheckCircle size={13} />
            Volunteer already assigned
          </div>
        )}
        {matchState === 'loading' && (
          <button type="button" className="match-btn loading" disabled>
            <Loader size={14} className="field-spin" />
            Searching for best match…
          </button>
        )}
        {matchState === 'error' && (
          <div className="match-error">
            <AlertTriangle size={13} />
            Match failed — try again
          </div>
        )}
        {matchState === 'no-match' && (
          <div className="match-error">
            <AlertTriangle size={13} />
            No eligible volunteers found
          </div>
        )}
        {matchState === 'done' && result && (
          <div className="match-result">
            <div className="match-result-header">
              <CheckCircle size={13} />
              <span>Assigned</span>
            </div>
            <div className="match-candidate top">
              <UserCheck size={13} />
              <span className="match-name">{result.assigned.name}</span>
              <span className="match-score">{(result.assigned.matchScore * 100).toFixed(0)}%</span>
            </div>
            {result.alternatives?.slice(0, 2).map((alt) => (
              <div key={alt.volunteer_id} className="match-candidate alt">
                <span className="match-rank-dot" />
                <span className="match-name">{alt.name}</span>
                <span className="match-score">{(alt.matchScore * 100).toFixed(0)}%</span>
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

export default function CommandMap({ incidents, selectedId, onSelect, onAssigned }) {
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
    <section className="map-region card">
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
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            subdomains="abcd"
            maxZoom={19}
          />

          {points.length > 0 && <FitToMarkers points={points} />}
          <FlyToSelected selectedId={selectedId} markerRefs={markerRefs} visible={visible} />

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
