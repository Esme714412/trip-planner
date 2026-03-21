import { useState, useCallback } from 'react';
import { AlertTriangle } from 'lucide-react';

const C = {
  primary:     '#48749E',
  ink:         '#111111',
  muted:       '#9CA3AF',
  card:        '#FFFFFF',
  border:      '#E8ECF0',
  danger:      '#E53E3E',
  dangerLight: '#FFF0F0',
};

function ConfirmModal({ message, confirmLabel = '確認刪除', onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-6"
      style={{background:'rgba(0,0,0,0.4)'}}>
      <div className="w-full rounded-3xl p-6 shadow-2xl"
        style={{background:C.card, maxWidth:'360px'}}>
        <div className="flex items-start gap-3 mb-5">
          <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
            style={{background:C.dangerLight}}>
            <AlertTriangle size={18} style={{color:C.danger}}/>
          </div>
          <p className="text-sm leading-relaxed pt-1.5 whitespace-pre-wrap"
            style={{color:C.ink}}>{message}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel}
            className="flex-1 py-3 rounded-2xl text-sm font-bold"
            style={{background:'#F4F7FA', color:C.muted}}>
            取消
          </button>
          <button onClick={onConfirm}
            className="flex-1 py-3 rounded-2xl text-sm font-black text-white"
            style={{background:C.danger}}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function useConfirm() {
  const [state, setState] = useState(null);

  const confirm = useCallback((message, confirmLabel) =>
    new Promise(resolve => setState({ message, confirmLabel, resolve }))
  , []);

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
