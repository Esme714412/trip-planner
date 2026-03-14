import { useState, useMemo, useEffect } from 'react';
import { X, Trash2, Plus, CreditCard, Users, ListTodo, Check } from 'lucide-react';

export default function ExpenseFormModal({ expenseItem, initialData, users, rates, baseCurrency, categories, onSave, onClose }) {
  const prefill = expenseItem?._prefill || {};
  const [items, setItems] = useState(
    initialData?.items || [{ id: Date.now().toString(), name: prefill.description || initialData?.description || '', price: prefill.amount || initialData?.amount || '' }]
  );
  const [currency,    setCurrency]    = useState(initialData?.currency    || prefill.currency || baseCurrency || Object.keys(rates)[0] || 'TWD');
  const [category,    setCategory]    = useState(initialData?.category    || categories[0] || '其他');
  const [description, setDescription] = useState(initialData?.description || prefill.description || '');
  const [paidBy,      setPaidBy]      = useState(
    initialData?.paidBy && users.includes(initialData.paidBy) ? initialData.paidBy : users[0] || ''
  );
  const [splitMode,   setSplitMode]   = useState(initialData?.splitMode   || 'equal');
  const [splitAmong,  setSplitAmong]  = useState(initialData?.splitAmong  || users);
  const [customSplit, setCustomSplit] = useState(initialData?.customSplit || users.reduce((acc, u) => ({ ...acc, [u]: '' }), {}));
  // AA 制：每人各付金額（預設等分）
  const [aaSplitAmong, setAaSplitAmong] = useState(initialData?.aaSplitAmong || users);

  const totalAmount = useMemo(() => items.reduce((sum, item) => sum + (parseFloat(item.price) || 0), 0), [items]);

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
    if (splitMode === 'equal' && splitAmong.length === 0) { alert('請至少選擇一位分攤人'); return; }
    if (splitMode === 'aa' && aaSplitAmong.length === 0) { alert('請至少選擇一位'); return; }

    let finalCustom = customSplit;
    if (splitMode === 'custom') {
      const { calculated, unspecifiedUsers, specifiedTotal } = smartCalc;
      if (unspecifiedUsers.length === 0 && Math.abs(specifiedTotal - totalAmount) > 0.01) {
        if (!confirm(`自訂分帳總和 (${specifiedTotal}) 與總金額 (${totalAmount}) 不符，仍要儲存？`)) return;
      }
      finalCustom = calculated;
    }

    onSave({
      id: initialData?.id || null,
      itineraryId: expenseItem?.id || initialData?.itineraryId || null,
      amount: totalAmount,
      items: items.filter(i => i.name.trim() || i.price),
      currency, category,
      description: finalDesc,
      paidBy: splitMode === 'aa' ? 'AA' : paidBy,
      splitMode,
      splitAmong: splitMode === 'aa' ? aaSplitAmong : splitAmong,
      aaSplitAmong: splitMode === 'aa' ? aaSplitAmong : undefined,
      customSplit: finalCustom,
    });
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="sticky top-0 bg-white p-4 border-b flex justify-between items-center z-10">
          <h2 className="font-bold text-lg">{initialData ? '編輯花費' : '新增花費'}</h2>
          <button onClick={onClose} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200"><X size={20}/></button>
        </div>

        <form className="p-5 space-y-6" onSubmit={handleSubmit}>
          {expenseItem?.id && (
            <div className="bg-indigo-50 text-indigo-700 p-3 rounded-xl text-sm font-medium">
              📍 關聯行程: {expenseItem.title}
            </div>
          )}

          {/* Name + Category */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-bold text-slate-500 mb-1">摘要名稱（選填）</label>
              <input type="text" className="w-full border rounded-lg p-3 bg-slate-50 focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="自動帶入第一筆商品名" value={description} onChange={e => setDescription(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">分類</label>
              <select className="w-full border rounded-lg p-3 bg-slate-50 text-sm outline-none" value={category} onChange={e => setCategory(e.target.value)}>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Items */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <label className="block text-sm font-bold text-slate-700 flex items-center gap-1"><ListTodo size={16}/> 明細項目</label>
            {items.map(item => (
              <div key={item.id} className="flex gap-2 items-center">
                <input required type="text" placeholder="商品名稱" className="flex-1 border rounded-lg p-2 text-sm outline-none focus:border-indigo-400" value={item.name} onChange={e => handleItemChange(item.id, 'name', e.target.value)} />
                <input required type="number" step="0.01" placeholder="金額" className="w-24 border rounded-lg p-2 text-sm text-right outline-none focus:border-indigo-400" value={item.price} onChange={e => handleItemChange(item.id, 'price', e.target.value)} />
                <button type="button" onClick={() => removeItem(item.id)} disabled={items.length === 1} className="p-2 text-slate-400 hover:text-red-500 disabled:opacity-30"><Trash2 size={16}/></button>
              </div>
            ))}
            <div className="flex justify-between items-center pt-2">
              <button type="button" onClick={addItem} className="text-xs text-indigo-600 font-bold bg-indigo-100 px-3 py-1.5 rounded-lg hover:bg-indigo-200 flex items-center gap-1"><Plus size={14}/> 新增一筆</button>
              <div className="text-sm font-bold text-slate-700 flex items-center gap-2">
                總計: <span className="text-lg text-indigo-600">{totalAmount}</span>
                <select className="border-b border-slate-300 bg-transparent text-sm outline-none font-normal" value={currency} onChange={e => setCurrency(e.target.value)}>
                  {Object.keys(rates).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Split */}
          <div className="p-4 border rounded-xl space-y-5 shadow-sm">
            {splitMode !== 'aa' && (
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2"><CreditCard size={16}/> 誰先代墊？</label>
                <div className="flex flex-wrap gap-2">
                  {users.map(u => (
                    <button type="button" key={u} onClick={() => setPaidBy(u)} className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${paidBy === u ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'}`}>{u}</button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-bold text-slate-700 flex items-center gap-2"><Users size={16}/> 分帳方式</label>
                <div className="flex bg-slate-200 p-1 rounded-lg">
                  <button type="button" onClick={() => setSplitMode('equal')}  className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors ${splitMode === 'equal'  ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}>平分</button>
                  <button type="button" onClick={() => setSplitMode('aa')}     className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors ${splitMode === 'aa'     ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}>AA制</button>
                  <button type="button" onClick={() => setSplitMode('custom')} className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors ${splitMode === 'custom' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}>自訂</button>
                </div>
              </div>

              {splitMode === 'aa' && (
                <div className="space-y-2 mt-3">
                  <p className="text-xs text-slate-400">各自付款，互不影響分帳結算。金額為每人各付金額，勾選有付這筆的人。</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {users.map(u => (
                      <button type="button" key={u} onClick={() => setAaSplitAmong(prev => prev.includes(u) ? prev.filter(x => x !== u) : [...prev, u])}
                        className={`px-4 py-2 rounded-lg border text-sm font-medium flex items-center gap-1 transition-colors ${aaSplitAmong.includes(u) ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-white text-slate-500 border-slate-300'}`}>
                        <Check size={14} className={aaSplitAmong.includes(u) ? 'opacity-100' : 'opacity-0'}/> {u}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-emerald-600 font-bold mt-1">
                    共 {aaSplitAmong.length} 人 × {totalAmount} {currency} = 總計 {(totalAmount * aaSplitAmong.length).toLocaleString()} {currency}
                  </p>
                </div>
              )}

              {splitMode === 'equal' && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {users.map(u => (
                    <button type="button" key={u} onClick={() => setSplitAmong(prev => prev.includes(u) ? prev.filter(x => x !== u) : [...prev, u])}
                      className={`px-4 py-2 rounded-lg border text-sm font-medium flex items-center gap-1 transition-colors ${splitAmong.includes(u) ? 'bg-indigo-100 text-indigo-800 border-indigo-300' : 'bg-white text-slate-500 border-slate-300'}`}>
                      <Check size={14} className={splitAmong.includes(u) ? 'opacity-100' : 'opacity-0'}/> {u}
                    </button>
                  ))}
                </div>
              )}

              {splitMode === 'custom' && (
                <div className="space-y-2 mt-3 bg-white p-3 rounded-lg border border-slate-200">
                  <p className="text-xs text-slate-400 mb-2">輸入 0 表示不分攤；留白自動均分剩餘金額。</p>
                  {users.map(u => {
                    const isBlank = customSplit[u] === '' || customSplit[u] === null || customSplit[u] === undefined;
                    return (
                      <div key={u} className="flex items-center gap-3">
                        <span className="text-sm font-medium text-slate-700 w-16 truncate">{u}</span>
                        <div className="flex-1 flex items-center gap-2">
                          <input type="number" step="1"
                            value={customSplit[u] ?? ''}
                            onChange={e => setCustomSplit(prev => ({ ...prev, [u]: e.target.value }))}
                            className={`flex-1 border-b p-1 text-right outline-none font-medium focus:border-indigo-500 ${isBlank ? 'border-dashed border-slate-300' : 'border-slate-300 text-slate-800'}`}
                          />
                          {isBlank && <span className="text-slate-400 text-sm shrink-0 w-12 text-right">{Math.round(smartCalc.perUnspecified)}</span>}
                        </div>
                      </div>
                    );
                  })}
                  {smartCalc.unspecifiedUsers.length === 0 && Math.abs(smartCalc.specifiedTotal - totalAmount) > 0.5 && (
                    <p className="text-xs text-red-500 font-bold text-right">⚠️ 自訂總和 ({Math.round(smartCalc.specifiedTotal)}) ≠ 總金額 ({Math.round(totalAmount)})</p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="pb-4">
            <button type="submit" className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-md hover:bg-indigo-700">儲存帳務</button>
          </div>
        </form>
      </div>
    </div>
  );
}
