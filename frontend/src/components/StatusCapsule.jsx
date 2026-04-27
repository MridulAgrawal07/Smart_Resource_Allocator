import { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';

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

export default function StatusCapsule() {
  const now = useClock();
  return (
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
  );
}
