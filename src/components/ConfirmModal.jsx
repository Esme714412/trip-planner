import { useState, useCallback } from 'react';
import { AlertTriangle } from 'lucide-react';

// ── Component ────────────────────────────────────────────────────────────────
function ConfirmModal({ message, confirmLabel = '確認刪除', onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 bg-slate-900/50 z-[70] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 bg-red-100 rounded-full flex items-center justify-center shrink-0">
            <AlertTriangle size={18} className="text-red-500" />
          </div>
          <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-wrap pt-1">{message}</p>
        </div>
        <div className="flex gap-3">
          <button onClick={onCancel}  className="flex-1 py-2.5 border border-slate-200 rounded-xl text-slate-600 font-medium hover:bg-slate-50 transition-colors">取消</button>
          <button onClick={onConfirm} className="flex-1 py-2.5 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 transition-colors">{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

// ── Hook ─────────────────────────────────────────────────────────────────────
export function useConfirm() {
  const [state, setState] = useState(null); // { message, confirmLabel, resolve }

  const confirm = useCallback((message, confirmLabel) => {
    return new Promise(resolve => setState({ message, confirmLabel, resolve }));
  }, []);

  const handleConfirm = () => { state?.resolve(true);  setState(null); };
  const handleCancel  = () => { state?.resolve(false); setState(null); };

  const ConfirmUI = state ? (
    <ConfirmModal
      message={state.message}
      confirmLabel={state.confirmLabel}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  ) : null;

  return { confirm, ConfirmUI };
}
