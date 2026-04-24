import { useCallback, useEffect, useRef, useState } from 'react';
import { Clock, MapPin, User, CheckCircle, XCircle, Inbox, Loader, RefreshCw, AlertTriangle } from 'lucide-react';
import { fetchPendingReports, approveReport, rejectReport } from '../api';
import { formatRelative } from '../util';

const POLL_MS = 20_000;

// Per-card action state: idle | approving | rejecting | approved | rejected | error
function PendingCard({ report, onRemove }) {
  const [state, setState] = useState('idle');
  const [errMsg, setErrMsg] = useState('');

  const handleApprove = useCallback(async () => {
    setState('approving');
    setErrMsg('');
    try {
      await approveReport(report._id);
      setState('approved');
      setTimeout(() => onRemove(report._id), 900);
    } catch (err) {
      setErrMsg(err.message || 'Approval failed');
      setState('error');
      setTimeout(() => setState('idle'), 3500);
    }
  }, [report._id, onRemove]);

  const handleReject = useCallback(async () => {
    setState('rejecting');
    setErrMsg('');
    try {
      await rejectReport(report._id);
      setState('rejected');
      setTimeout(() => onRemove(report._id), 500);
    } catch (err) {
      setErrMsg(err.message || 'Rejection failed');
      setState('error');
      setTimeout(() => setState('idle'), 3500);
    }
  }, [report._id, onRemove]);

  const busy = state === 'approving' || state === 'rejecting';
  const exiting = state === 'approved' || state === 'rejected';

  return (
    <div className={`pending-card ${exiting ? `pending-card--${state}` : ''}`}>
      <div className="pending-card-body">
        <p className="pending-card-text">{report.original_text}</p>
        <div className="pending-card-meta">
          <span className="pending-meta-item">
            <User size={11} strokeWidth={2.4} />
            {report.worker_id || 'anonymous'}
          </span>
          <span className="pending-meta-item">
            <Clock size={11} strokeWidth={2.4} />
            {formatRelative(report.submitted_at || report.received_at)}
          </span>
          {report.gps_coordinates?.lat != null && (
            <span className="pending-meta-item">
              <MapPin size={11} strokeWidth={2.4} />
              {report.gps_coordinates.lat.toFixed(4)}, {report.gps_coordinates.lng.toFixed(4)}
            </span>
          )}
          {report.media_refs?.length > 0 && (
            <span className="pending-meta-item pending-meta-item--media">
              Photo attached
            </span>
          )}
        </div>
      </div>

      {state === 'error' && (
        <div className="pending-card-error">
          <AlertTriangle size={11} strokeWidth={2.4} />
          {errMsg}
        </div>
      )}

      <div className="pending-card-actions">
        <button
          type="button"
          className="pending-btn pending-btn--approve"
          onClick={handleApprove}
          disabled={busy}
        >
          {state === 'approving' ? (
            <Loader size={12} className="pending-spin" />
          ) : (
            <CheckCircle size={12} strokeWidth={2.4} />
          )}
          {state === 'approving' ? 'Processing…' : 'Approve'}
        </button>
        <button
          type="button"
          className="pending-btn pending-btn--reject"
          onClick={handleReject}
          disabled={busy}
        >
          {state === 'rejecting' ? (
            <Loader size={12} className="pending-spin" />
          ) : (
            <XCircle size={12} strokeWidth={2.4} />
          )}
          Reject
        </button>
      </div>
    </div>
  );
}

export default function PendingApprovals({ onCountChange }) {
  const [reports, setReports] = useState([]);
  const [loadState, setLoadState] = useState('loading');
  const [lastRefresh, setLastRefresh] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchPendingReports();
      const list = Array.isArray(data.reports) ? data.reports : [];
      setReports(list);
      onCountChange?.(list.length);
      setLoadState('ready');
      setLastRefresh(new Date());
    } catch (err) {
      console.error('[PendingApprovals]', err);
      setLoadState((prev) => (prev === 'ready' ? 'ready' : 'error'));
    }
  }, [onCountChange]);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  const handleRemove = useCallback((id) => {
    setReports((prev) => {
      const next = prev.filter((r) => r._id !== id);
      onCountChange?.(next.length);
      return next;
    });
  }, [onCountChange]);

  const lastRefreshRef = useRef(null);
  lastRefreshRef.current = lastRefresh;

  return (
    <aside className="approval-region card">
      {/* Header */}
      <div className="approval-header">
        <div className="approval-title-block">
          <div className="approval-icon-bubble" aria-hidden="true">
            <Inbox strokeWidth={2.2} />
          </div>
          <div>
            <h2>Pending Approvals</h2>
            <div className="approval-subtitle">Unverified field reports</div>
          </div>
        </div>
        <div className="approval-header-right">
          {reports.length > 0 && (
            <span className="approval-count">{reports.length} waiting</span>
          )}
          <button
            type="button"
            className="approval-refresh-btn"
            onClick={load}
            title="Refresh"
          >
            <RefreshCw size={13} strokeWidth={2.2} />
          </button>
        </div>
      </div>

      {/* Warning banner — separates this inbox from live operational data */}
      <div className="approval-warning-banner">
        <AlertTriangle size={11} strokeWidth={2.4} />
        Reports below are unverified and not yet visible in the Live Feed. Approve to trigger AI analysis and clustering.
      </div>

      {/* Content */}
      <div className="approval-list">
        {loadState === 'loading' ? (
          <div className="approval-empty">
            <span className="spinner" />
            <span>Loading queue…</span>
          </div>
        ) : loadState === 'error' ? (
          <div className="approval-empty approval-empty--error">
            <AlertTriangle size={20} />
            <span>Could not load queue</span>
            <button type="button" className="approval-retry" onClick={load}>Retry</button>
          </div>
        ) : reports.length === 0 ? (
          <div className="approval-empty">
            <div className="approval-empty-icon">
              <CheckCircle />
            </div>
            <span>Inbox clear — no reports pending review.</span>
          </div>
        ) : (
          reports.map((r) => (
            <PendingCard key={r._id} report={r} onRemove={handleRemove} />
          ))
        )}
      </div>
    </aside>
  );
}
