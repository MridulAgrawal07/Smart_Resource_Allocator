import { useCallback, useEffect, useMemo, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import TopBar from './components/TopBar';
import CommandMap from './components/CommandMap';
import LiveFeed from './components/LiveFeed';
import StatsStrip from './components/StatsStrip';
import { fetchIncidents, runAssistantQuery } from './api';
import { applyAssistantFilter } from './util';

const POLL_INTERVAL_MS = 15_000;

export default function App() {
  const [incidents, setIncidents] = useState([]);
  const [loadState, setLoadState] = useState('loading'); // loading | ready | error
  const [errorMsg, setErrorMsg] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const [filter, setFilter] = useState(null);
  const [filterQuery, setFilterQuery] = useState('');
  const [assistantState, setAssistantState] = useState('idle');

  const refresh = useCallback(async () => {
    try {
      const data = await fetchIncidents();
      setIncidents(Array.isArray(data.incidents) ? data.incidents : []);
      setLoadState('ready');
      setErrorMsg('');
    } catch (err) {
      console.error(err);
      setLoadState((prev) => (prev === 'ready' ? 'ready' : 'error'));
      setErrorMsg(err.message || 'Failed to load incidents');
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const handleAssistant = useCallback(async (query) => {
    setAssistantState('loading');
    try {
      const res = await runAssistantQuery(query);
      setFilter(res.filter || null);
      setFilterQuery(query);
      setAssistantState('idle');
    } catch (err) {
      console.error(err);
      setAssistantState('error');
      setTimeout(() => setAssistantState('idle'), 1500);
    }
  }, []);

  const clearFilter = () => {
    setFilter(null);
    setFilterQuery('');
  };

  const handleAssigned = useCallback((incidentId) => {
    // Optimistic update: patch the incident status locally so UI reacts immediately
    setIncidents((prev) =>
      prev.map((inc) =>
        inc._id === incidentId ? { ...inc, status: 'assigned' } : inc
      )
    );
    // Delay backend refresh so the popup stays open while user reads the result
    setTimeout(refresh, 5000);
  }, [refresh]);

  const visibleIncidents = useMemo(
    () => applyAssistantFilter(incidents, filter),
    [incidents, filter]
  );

  return (
    <div className="app">
      <TopBar onAssistantSubmit={handleAssistant} assistantState={assistantState} />

      {filter && (
        <div className="filter-strip">
          <span className="badge">
            <Sparkles size={11} strokeWidth={2.4} />
            AI Filter
          </span>
          <span className="rationale">
            <span className="q">“{filterQuery}”</span>
            {filter.rationale ? ` — ${filter.rationale}` : ''}
          </span>
          {filter.categories?.map((c) => (
            <span key={`c-${c}`} className="chip">{c}</span>
          ))}
          {filter.min_impact_score > 0 && (
            <span className="chip">score ≥ {filter.min_impact_score.toFixed(2)}</span>
          )}
          {filter.people_affected && (
            <span className="chip">
              people {Object.entries(filter.people_affected).map(([op, v]) =>
                `${op.replace('$gt', '>').replace('$gte', '≥').replace('$lt', '<').replace('$lte', '≤')} ${v}`
              ).join(', ')}
            </span>
          )}
          {filter.keywords?.map((k) => (
            <span key={`k-${k}`} className="chip">{k}</span>
          ))}
          <button type="button" className="chip-clear" onClick={clearFilter}>
            <X />
            Clear
          </button>
        </div>
      )}

      <div className="workspace">
        <CommandMap
          incidents={visibleIncidents}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onAssigned={handleAssigned}
        />
        <LiveFeed
          incidents={visibleIncidents}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />

        {loadState === 'loading' && (
          <div className="region-overlay">
            <div className="panel">
              <span className="spinner" />
              <span className="v">Loading operational data…</span>
            </div>
          </div>
        )}
        {loadState === 'error' && (
          <div className="region-overlay">
            <div className="panel">
              <span className="v">Connection error — {errorMsg}</span>
            </div>
          </div>
        )}
      </div>

      <StatsStrip incidents={visibleIncidents} totalUnfiltered={incidents.length} />
    </div>
  );
}
