import { useState } from 'react';
import { Search, Sparkles, Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export default function TopBar({ onAssistantSubmit, assistantState }) {
  const { isDarkMode, toggleDark: onToggleDark } = useTheme();
  const [value, setValue] = useState('');

  const submit = (e) => {
    e.preventDefault();
    const q = value.trim();
    if (!q) return;
    onAssistantSubmit(q);
  };

  return (
    <header className="topbar">
      <div className="control-panel-title">Control Panel</div>

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

      <button
        type="button"
        className="dark-toggle"
        onClick={onToggleDark}
        title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {isDarkMode ? <Sun size={17} strokeWidth={2.2} /> : <Moon size={17} strokeWidth={2.2} />}
      </button>
    </header>
  );
}
