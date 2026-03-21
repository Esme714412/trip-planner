import { useState, useMemo, useEffect } from 'react';
import { X, Trash2, Plus, Check, ListTodo, CreditCard, Users } from 'lucide-react';

const C = {
  primary:      '#48749E',
  primaryLight: '#EAF0F6',
  primaryDark:  '#2F5478',
  warning:      '#FA9819',
  warningLight: '#FEF3E0',
  ink:          '#111111',
  body:         '#444444',
  muted:        '#9CA3AF',
  card:         '#FFFFFF',
  border:       '#E8ECF0',
  danger:       '#E53E3E',
  dangerLight:  '#FFF0F0',
  cardShadow:   '0 2px 12px rgba(72,116,158,0.10), 0 1px 3px rgba(0,0,0,0.04)',
};

export default function ExpenseFormModal({ expenseItem, initialData, users, rates, baseCurrency, categories, onSave, onClose }) {
  const prefill = expenseItem?._prefill || {};

  const [items,        setItems]        = useState(
    initialData?.items || [{ id: Date.now().toString(), name: prefill.description || initialData?.description || '', price: prefill.amount || initialData?.amount || '' }]
  );
  const [currency,     setCurrency]     = useState(initialData?.currency    || prefill.currency || baseCurrency || Object.keys(rates)[0] || 'TWD');
  const [category,     setCategory]     = useState(initialData?.category    || categories[0] || '其他');
  const [description,  setDescription]  = useState(initialData?.description || prefill.description || '');
  const [paidBy,       setPaidBy]       = useState(initialData?.paidBy && users.includes(initialData.paidBy) ? initialData.paidBy : users[0] || '');
  const [splitMode,    setSplitMode]    = useState(initialData?.splitMode   || 'equal');
  const [splitAmong,   setSplitAmong]   = useState(initialData?.splitAmong  || users);
  const [customSplit,  setCustomSplit]  = useState(initialData?.customSplit || users.reduce((acc, u) => ({ ...acc, [u]: '' }), {}));
  const [aaSplitAmong, setAaSplitAmong] = useState(initialData?.aaSplitAmong || users);

  const totalAmount = useMemo(() => items.reduce((sum, i) => sum + (parseFloat(i.price) || 0), 0), [items]);

  useEffect(() => {
    setCustomSplit(prev => {
      const updated = { ...prev };
      users.forEach(u => { if (updated[u] === undefined) updated[u] = ''; });
      return updated;
    });
  }, [users]);

  const smartCalc = useMemo(() => {
    let specifiedTotal = 0;
    const unspecifiedUsers = [];
    users.forEach(u => {
      const val = customSplit[u];
      if (val !== '' && val !== null && val !== undefined) specifiedTotal += parseFloat(val) || 0;
      else unspecifiedUsers.push(u);
    });
    const remaining = Math.max(0, totalAmount - specifiedTotal);
    const perUnspecified = unspecifiedUsers.length > 0 ? remaining / unspecifiedUsers.length : 0;
    const calculated = {};
    users.forEach(u => {
      const val = customSplit[u];
      calculated[u] = (val !== '' && val !== null && val !== undefined) ? parseFloat(val) || 0 : perUnspecified;
    });
    return { calculated, unspecifiedUsers, specifiedTotal, perUnspecified };
  }, [customSplit, users, totalAmount]);

  const handleItemChange = (id, field, value) => setItems(items.map(i => i.id === id ? { ...i, [field]: value } : i));
  const addItem    = () => setItems([...items, { id: Date.now().toString(), name: '', price: '' }]);
  const removeItem = (id) => { if (items.length > 1) setItems(items.filter(i => i.id !== id)); };

  const handleSubmit = (e) => {
    e.preventDefault();
    let finalDesc = description.trim();
    if (!finalDesc) {
      const valid = items.filter(i => i.name.trim());
      finalDesc = valid.length > 0 ? valid[0].name + (valid.length > 1 ? ' 等' : '') : '未命名花費';
    }
    if (totalAmount <= 0) { alert('總金額必須大於 0'); return; }
    const finalCustom = splitMode === 'custom'
      ? Object.fromEntries(Object.entries(customSplit).map(([u, v]) => [u, v === '' ? smartCalc.perUnspecified : parseFloat(v) || 0]))
      : undefined;
    const expenseData = {
      ...(initialData || {}),
      description: finalDesc,
      items,
      amount: totalAmount,
      currency,
      category,
      paidBy: splitMode === 'aa' ? 'AA' : paidBy,
      splitMode,
      splitAmong: splitMode === 'aa' ? aaSplitAmong : splitAmong,
      customSplit: finalCustom,
    };
    if (splitMode === 'aa') expenseData.aaSplitAmong = aaSplitAmong;
    onSave(expenseData);
  };

  const baseRate = rates[baseCurrency] || 1;
  const expRate  = rates[currency] || 1;
  const converted = Math.round((totalAmount * expRate) / baseRate);

  return (
    <div className="fixed inset-0 z-[80] flex flex-col justify-end" style={{background:'rgba(0,0,0,0.4)'}}>
      <div className="w-full rounded-t-3xl flex flex-col" style={{background:C.card, maxHeight:'92dvh', maxWidth:'448px', width:'100%', margin:'0 auto', boxShadow:'0 -8px 40px rgba(0,0,0,0.18)'}}>

        {/* 把手 + Header */}
        <div className="shrink-0 px-5 pt-3 pb-4" style={{borderBottom:`1px solid ${C.border}`}}>
          <div className="flex justify-center mb-3">
            <div className="w-10 h-1 rounded-full" style={{background:C.border}}/>
          </div>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black" style={{color:C.ink}}>{initialData ? '編輯帳務' : '新增帳務'}</h2>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full" style={{background:'#F4F7FA', color:C.muted}}>
              <X size={16}/>
            </button>
          </div>
          {expenseItem?.id && (
            <div className="mt-2 px-3 py-1.5 rounded-xl text-xs font-bold" style={{background:C.primaryLight, color:C.primary}}>
              📍 {expenseItem.title}
            </div>
          )}
        </div>

        {/* 可捲動內容 */}
        <form className="flex flex-col flex-1 min-h-0" onSubmit={handleSubmit}>
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

            {/* 摘要 + 分類 */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <p className="text-[10px] font-black uppercase tracking-widest mb-1.5" style={{color:C.muted}}>摘要名稱（選填）</p>
                <input type="text" placeholder="自動帶入第一筆名稱"
                  className="w-full border rounded-2xl px-4 py-2.5 text-sm"
                  style={{borderColor:C.border, color:C.ink}}
                  value={description} onChange={e => setDescription(e.target.value)}/>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest mb-1.5" style={{color:C.muted}}>分類</p>
                <select className="w-full border rounded-2xl px-3 py-2.5 text-sm font-bold"
                  style={{borderColor:C.border, color:C.body}}
                  value={category} onChange={e => setCategory(e.target.value)}>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            {/* 明細項目 */}
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{color:C.muted}}>明細項目</p>
              <div className="rounded-2xl overflow-hidden" style={{border:`1px solid ${C.border}`, background:'#F8FAFC'}}>
                <div className="px-4 py-3 space-y-2.5">
                  {items.map(item => (
                    <div key={item.id} className="flex gap-2 items-center">
                      <input required type="text" placeholder="商品名稱"
                        className="flex-1 border rounded-xl px-3 py-2 text-sm"
                        style={{borderColor:C.border, color:C.ink, background:C.card}}
                        value={item.name} onChange={e => handleItemChange(item.id, 'name', e.target.value)}/>
                      <input required type="number" step="0.01" placeholder="金額"
                        className="w-24 border rounded-xl px-3 py-2 text-sm text-right"
                        style={{borderColor:C.border, color:C.ink, background:C.card}}
                        value={item.price} onChange={e => handleItemChange(item.id, 'price', e.target.value)}/>
                      <button type="button" onClick={() => removeItem(item.id)} disabled={items.length === 1}
                        className="p-1.5 rounded-lg"
                        style={{color:items.length===1?C.muted:C.danger, opacity:items.length===1?0.3:1}}>
                        <Trash2 size={15}/>
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between px-4 py-2.5" style={{borderTop:`1px solid ${C.border}`}}>
                  <button type="button" onClick={addItem}
                    className="flex items-center gap-1 text-xs font-black px-3 py-1.5 rounded-xl"
                    style={{background:C.primaryLight, color:C.primary}}>
                    <Plus size={13}/>新增一筆
                  </button>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black" style={{color:C.ink}}>{totalAmount.toLocaleString()}</span>
                    <select className="border rounded-xl px-2 py-1 text-sm font-bold"
                      style={{borderColor:C.border, color:C.body}}
                      value={currency} onChange={e => setCurrency(e.target.value)}>
                      {Object.keys(rates).map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                {currency !== baseCurrency && totalAmount > 0 && (
                  <div className="flex items-center gap-2 px-4 py-2" style={{borderTop:`1px solid ${C.border}`}}>
                    <span className="text-xs" style={{color:C.muted}}>≈</span>
                    <span className="text-sm font-black" style={{color:'#B6C9CF'}}>{baseCurrency} {converted.toLocaleString()}</span>
                    <span className="text-xs ml-auto" style={{color:C.muted}}>1 {currency} = {rates[currency]} {baseCurrency}</span>
                  </div>
                )}
              </div>
            </div>

            {/* 誰代墊 */}
            {splitMode !== 'aa' && (
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{color:C.muted}}>誰先代墊</p>
                <div className="flex flex-wrap gap-2">
                  {users.map(u => (
                    <button type="button" key={u} onClick={() => setPaidBy(u)}
                      className="px-4 py-2 rounded-2xl text-sm font-black transition-all"
                      style={paidBy===u ? {background:C.primary,color:'#fff'} : {background:'#F4F7FA',color:C.body,border:`1px solid ${C.border}`}}>
                      {u}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 分帳方式 */}
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{color:C.muted}}>分帳方式</p>
              <div className="flex gap-1 p-1 rounded-2xl mb-3" style={{background:'#F4F7FA'}}>
                {[['equal','平分'],['aa','AA制'],['custom','自訂']].map(([m,l]) => (
                  <button type="button" key={m} onClick={() => setSplitMode(m)}
                    className="flex-1 py-2 rounded-xl text-xs font-black transition-all"
                    style={splitMode===m ? {background:C.primary,color:'#fff'} : {color:C.muted}}>
                    {l}
                  </button>
                ))}
              </div>

              {splitMode === 'equal' && (
                <div>
                  <div className="flex flex-wrap gap-2">
                    {users.map(u => (
                      <button type="button" key={u}
                        onClick={() => setSplitAmong(prev => prev.includes(u) ? prev.filter(x=>x!==u) : [...prev,u])}
                        className="flex items-center gap-1 px-4 py-2 rounded-2xl text-sm font-bold transition-all"
                        style={splitAmong.includes(u)
                          ? {background:C.primaryLight,color:C.primary,border:`1.5px solid ${C.primary}`}
                          : {background:'#F4F7FA',color:C.muted,border:`1px solid ${C.border}`}}>
                        {splitAmong.includes(u) && <Check size={12}/>}{u}
                      </button>
                    ))}
                  </div>
                  {splitAmong.length > 0 && totalAmount > 0 && (
                    <p className="text-xs mt-2 font-bold" style={{color:C.muted}}>
                      每人 {currency} {(totalAmount / splitAmong.length).toFixed(0)}
                    </p>
                  )}
                </div>
              )}

              {splitMode === 'aa' && (
                <div>
                  <p className="text-xs mb-2" style={{color:C.muted}}>各自付款，勾選有付這筆的人</p>
                  <div className="flex flex-wrap gap-2">
                    {users.map(u => (
                      <button type="button" key={u}
                        onClick={() => setAaSplitAmong(prev => prev.includes(u) ? prev.filter(x=>x!==u) : [...prev,u])}
                        className="flex items-center gap-1 px-4 py-2 rounded-2xl text-sm font-bold transition-all"
                        style={aaSplitAmong.includes(u)
                          ? {background:C.primaryLight,color:C.primary,border:`1.5px solid ${C.primary}`}
                          : {background:'#F4F7FA',color:C.muted,border:`1px solid ${C.border}`}}>
                        {aaSplitAmong.includes(u) && <Check size={12}/>}{u}
                      </button>
                    ))}
                  </div>
                  {aaSplitAmong.length > 0 && totalAmount > 0 && (
                    <p className="text-xs mt-2 font-bold" style={{color:C.primary}}>
                      共 {aaSplitAmong.length} 人 × {totalAmount} {currency} = {(totalAmount * aaSplitAmong.length).toLocaleString()} {currency}
                    </p>
                  )}
                </div>
              )}

              {splitMode === 'custom' && (
                <div className="rounded-2xl overflow-hidden" style={{border:`1px solid ${C.border}`}}>
                  <div className="px-4 py-3 space-y-2">
                    <p className="text-xs" style={{color:C.muted}}>留白＝自動均分剩餘；輸入 0＝不分攤</p>
                    {users.map(u => {
                      const isBlank = customSplit[u] === '' || customSplit[u] === null || customSplit[u] === undefined;
                      return (
                        <div key={u} className="flex items-center gap-3">
                          <span className="text-sm font-bold w-16 truncate" style={{color:C.ink}}>{u}</span>
                          <input type="number" step="1"
                            value={customSplit[u] ?? ''}
                            onChange={e => setCustomSplit(prev => ({ ...prev, [u]: e.target.value }))}
                            className="flex-1 border rounded-xl px-3 py-2 text-sm text-right"
                            style={{borderColor:isBlank?C.border:C.primary, color:C.ink}}/>
                          {isBlank && <span className="text-xs shrink-0 w-14 text-right font-bold" style={{color:C.muted}}>{Math.round(smartCalc.perUnspecified)}</span>}
                        </div>
                      );
                    })}
                  </div>
                  {smartCalc.unspecifiedUsers.length === 0 && Math.abs(smartCalc.specifiedTotal - totalAmount) > 0.5 && (
                    <div className="px-4 py-2" style={{borderTop:`1px solid ${C.border}`}}>
                      <p className="text-xs font-black" style={{color:C.danger}}>⚠️ 自訂總和 ({Math.round(smartCalc.specifiedTotal)}) ≠ 總金額 ({Math.round(totalAmount)})</p>
                    </div>
                  )}
                </div>
              )}
            </div>

          </div>

          {/* 送出按鈕 */}
          <div className="shrink-0 px-5 pt-3 pb-8" style={{borderTop:`1px solid ${C.border}`}}>
            <button type="submit"
              className="w-full py-3.5 rounded-2xl text-sm font-black text-white"
              style={{background: totalAmount > 0 ? C.primary : C.muted, transition:'background 0.15s'}}>
              儲存帳務
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
