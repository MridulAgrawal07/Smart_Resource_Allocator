import { useEffect, useState } from 'react';
import { CheckCircle, AlertTriangle, X } from 'lucide-react';

const ICONS = {
  success: CheckCircle,
  error: AlertTriangle,
};

function ToastItem({ toast, onDismiss }) {
  const [exiting, setExiting] = useState(false);
  const Icon = ICONS[toast.type] || CheckCircle;

  useEffect(() => {
    const t1 = setTimeout(() => setExiting(true), toast.duration - 350);
    const t2 = setTimeout(() => onDismiss(toast.id), toast.duration);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [toast.id, toast.duration, onDismiss]);

  return (
    <div className={`sra-toast ${toast.type} ${exiting ? 'exit' : 'enter'}`}>
      <Icon size={15} strokeWidth={2.2} />
      <span className="sra-toast-msg">{toast.message}</span>
      <button
        type="button"
        className="sra-toast-close"
        onClick={() => onDismiss(toast.id)}
      >
        <X size={12} />
      </button>
    </div>
  );
}

let _nextId = 0;
let _pushFn = null;

export function showToast(message, type = 'success', duration = 4000) {
  if (_pushFn) _pushFn({ id: ++_nextId, message, type, duration });
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    _pushFn = (t) => setToasts((prev) => [...prev, t]);
    return () => { _pushFn = null; };
  }, []);

  const dismiss = (id) => setToasts((prev) => prev.filter((t) => t.id !== id));

  if (toasts.length === 0) return null;

  return (
    <div className="sra-toast-container">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
      ))}
    </div>
  );
}
