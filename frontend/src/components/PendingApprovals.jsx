import { useCallback, useEffect, useRef, useState } from 'react';
import { Clock, MapPin, User, CheckCircle, XCircle, Inbox, Loader, RefreshCw, AlertTriangle, Mic, Trash2 } from 'lucide-react';
import { fetchPendingReports, approveReport, rejectReport } from '../api';
import { formatRelative } from '../util';
import { showToast } from './Toast';

const POLL_MS = 20_000;

// ── Backend report card ──────────────────────────────────────────────────────

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

// ── Audio report card (localStorage) ────────────────────────────────────────

function AudioReportCard({ report, onRemove }) {
  const [approving, setApproving] = useState(false);

  const handleApprove = () => {
    setApproving(true);
    try {
      const existing = JSON.parse(localStorage.getItem('pending_audio_reports') || '[]');
      const updated = existing.filter((r) => r.id !== report.id);
      localStorage.setItem('pending_audio_reports', JSON.stringify(updated));
      setTimeout(() => {
        onRemove(report.id);
        showToast('Report approved and memory cleared.', 'success', 3000);
      }, 400);
    } catch {
      setApproving(false);
    }
  };

  return (
    <div className={`pending-card audio-report-card ${approving ? 'pending-card--approved' : ''}`}>
      <div className="pending-card-body">
        <div className="audio-report-card-header">
          <span className="audio-report-badge">
            <Mic size={10} strokeWidth={2.4} />
            Audio
          </span>
          <span className="pending-meta-item">
            <Clock size={11} strokeWidth={2.4} />
            {new Date(report.timestamp).toLocaleString()}
          </span>
        </div>
        <audio
          controls
          src={report.audioData}
          className="audio-report-player"
          preload="metadata"
        />
      </div>

      <div className="pending-card-actions">
        <button
          type="button"
          className="pending-btn pending-btn--approve"
          onClick={handleApprove}
          disabled={approving}
        >
          {approving ? (
            <Loader size={12} className="pending-spin" />
          ) : (
            <CheckCircle size={12} strokeWidth={2.4} />
          )}
          {approving ? 'Clearing…' : 'Approve & Clear'}
        </button>
        <button
          type="button"
          className="pending-btn pending-btn--reject"
          onClick={() => {
            try {
              const existing = JSON.parse(localStorage.getItem('pending_audio_reports') || '[]');
              localStorage.setItem('pending_audio_reports', JSON.stringify(existing.filter((r) => r.id !== report.id)));
            } catch { /* ignore */ }
            onRemove(report.id);
          }}
        >
          <Trash2 size={12} strokeWidth={2.4} />
          Discard
        </button>
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function PendingApprovals({ onCountChange }) {
  const [reports, setReports] = useState([]);
  const [loadState, setLoadState] = useState('loading');
  const [lastRefresh, setLastRefresh] = useState(null);
  const [audioReports, setAudioReports] = useState([]);

  const loadAudioReports = useCallback(() => {
    try {
      const items = JSON.parse(localStorage.getItem('pending_audio_reports') || '[]');
      setAudioReports(Array.isArray(items) ? items : []);
    } catch {
      setAudioReports([]);
    }
  }, []);

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
    loadAudioReports();
    const id = setInterval(() => {
      load();
      loadAudioReports();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [load, loadAudioReports]);

  const handleRemove = useCallback((id) => {
    setReports((prev) => {
      const next = prev.filter((r) => r._id !== id);
      onCountChange?.(next.length);
      return next;
    });
  }, [onCountChange]);

  const handleRemoveAudio = useCallback((id) => {
    setAudioReports((prev) => prev.filter((r) => r.id !== id));
  }, []);

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
          {(reports.length + audioReports.length) > 0 && (
            <span className="approval-count">{reports.length + audioReports.length} waiting</span>
          )}
          <button
            type="button"
            className="approval-refresh-btn"
            onClick={() => { load(); loadAudioReports(); }}
            title="Refresh"
          >
            <RefreshCw size={13} strokeWidth={2.2} />
          </button>
        </div>
      </div>

      {/* Warning banner */}
      <div className="approval-warning-banner">
        <AlertTriangle size={11} strokeWidth={2.4} />
        Reports below are unverified and not yet visible in the Live Feed. Approve to trigger AI analysis and clustering.
      </div>

      {/* Backend reports */}
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
        ) : reports.length === 0 && audioReports.length === 0 ? (
          <div className="approval-empty">
            <div className="approval-empty-icon">
              <CheckCircle />
            </div>
            <span>Inbox clear — no reports pending review.</span>
          </div>
        ) : (
          <>
            {reports.map((r) => (
              <PendingCard key={r._id} report={r} onRemove={handleRemove} />
            ))}

            {/* Audio reports section */}
            {audioReports.length > 0 && (
              <>
                {reports.length > 0 && <div className="audio-reports-divider" />}
                <div className="audio-reports-section-label">
                  <Mic size={11} strokeWidth={2.4} />
                  Audio Reports ({audioReports.length})
                </div>
                {audioReports.map((r) => (
                  <AudioReportCard key={r.id} report={r} onRemove={handleRemoveAudio} />
                ))}
              </>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
