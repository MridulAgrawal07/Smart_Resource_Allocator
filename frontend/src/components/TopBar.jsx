import { useEffect, useState } from 'react';
import { Search, Sparkles, Activity } from 'lucide-react';

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function formatClock(d) {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export default function TopBar({ onAssistantSubmit, assistantState }) {
  const now = useClock();
  const [value, setValue] = useState('');

  const submit = (e) => {
    e.preventDefault();
    const q = value.trim();
    if (!q) return;
    onAssistantSubmit(q);
  };

  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L4 6v6c0 5 3.5 9.5 8 10 4.5-.5 8-5 8-10V6l-8-4z" />
            <path d="M9 12l2 2 4-4" />
          </svg>
        </div>
        <div className="brand-text">
          <div className="brand-name">SRA Coordinator</div>
          <span className="brand-sub">Smart Resource Allocation</span>
        </div>
      </div>

      <div className="assistant-bar">
        <form className="assistant-form" onSubmit={submit} role="search">
          <Search className="search-icon" aria-hidden="true" />
          <input
            className="assistant-input"
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Ask AI: Show me high priority safety issues…"
            aria-label="AI search"
          />
          <span className="assistant-hint">
            <kbd>↵</kbd>
          </span>
          <button
            className="assistant-submit"
            type="submit"
            disabled={assistantState === 'loading'}
          >
            {assistantState === 'loading' ? (
              <>
                <span
                  className="spinner"
                  style={{
                    borderColor: 'rgba(255,255,255,0.35)',
                    borderTopColor: 'white',
                  }}
                />
                Parsing
              </>
            ) : (
              <>
                <Sparkles size={13} strokeWidth={2.4} />
                Ask AI
              </>
            )}
          </button>
        </form>
      </div>

      <div className="topbar-actions">
        <div className="status-capsule">
          <span className="status-capsule-live">
            <span className="dot" />
            Live
          </span>
          <span className="status-capsule-divider" />
          <span className="status-capsule-clock">
            <Activity size={11} />
            {formatClock(now)}
          </span>
        </div>
      </div>
    </header>
  );
}
