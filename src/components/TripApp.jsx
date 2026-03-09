import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { doc, updateDoc, serverTimestamp, setDoc, getDocs, collection, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import {
  MapPin, Clock, Globe, ShoppingBag, Ticket, Navigation,
  Car, Plus, Edit2, Trash2, DollarSign, PieChart, Download,
  ChevronUp, ChevronDown, Check, X, Users, CreditCard,
  ListTodo, ToggleLeft, ToggleRight, Calendar,
  Settings, Lock, Unlock, Tag, Save, Star, Plane, Luggage,
  Camera as CameraIcon, ArrowLeft, Wifi, WifiOff, ArrowRight,
  Share2,} from 'lucide-react';
import ExpenseFormModal from './ExpenseFormModal';
import { useConfirm } from './ConfirmModal';
//─── users view setting ──────────────────────────────────────────────────────────────────
const [isShareOpen,    setIsShareOpen]    = useState(false);
const [shareEditors,   setShareEditors]   = useState(initialData.editors  || []);
const [shareViewers,   setShareViewers]   = useState(initialData.viewers  || []);
const [newShareEmail,  setNewShareEmail]  = useState('');
const [newShareRole,   setNewShareRole]   = useState('viewer');
const [shareStatus,    setShareStatus]    = useState('');
// ─── Helpers ──────────────────────────────────────────────────────────────────
const TRIP_ICONS = [Plane, MapPin, Luggage, CameraIcon];
const TRIP_EMOJIS = ['✈️', '🗺️', '🎒', '📸'];

function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debouncedValue;
}

function calcSettlement(userStats) {
  const balances = Object.entries(userStats).map(([name, s]) => ({
    name,
    balance: Math.round(s.paid - s.consumed),
  }));
  const creditors = balances.filter(b => b.balance > 0).map(b => ({ ...b }));
  const debtors   = balances.filter(b => b.balance < 0).map(b => ({ ...b, balance: Math.abs(b.balance) }));
  const result = [];
  let ci = 0, di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const amount = Math.min(creditors[ci].balance, debtors[di].balance);
    if (amount > 0) result.push({ from: debtors[di].name, to: creditors[ci].name, amount });
    creditors[ci].balance -= amount;
    debtors[di].balance   -= amount;
    if (creditors[ci].balance === 0) ci++;
    if (debtors[di].balance   === 0) di++;
  }
  return result;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function TripApp({ uid, tripId, initialData, onBack }) {
  const { confirm, ConfirmUI } = useConfirm();

  // ── Core state (initialised from Firestore doc) ──────────────────────────
  const [tripName,      setTripName]      = useState(initialData.name         || '新旅程');
  const [tripIconIndex, setTripIconIndex] = useState(initialData.iconIndex    ?? 0);
  const [users,         setUsers]         = useState(initialData.users        || ['自己']);
  const [rates,         setRates]         = useState(initialData.rates        || { TWD: 1, JPY: 0.21, USD: 31.5 });
  const [baseCurrency,  setBaseCurrency]  = useState(initialData.baseCurrency || 'TWD');
  const [categories,    setCategories]    = useState(initialData.categories   || ['飲食','交通','住宿','購物','娛樂','門票','其他']);
  const [checklist,     setChecklist]     = useState(initialData.checklist    || []);
  const [itinerary,     setItinerary]     = useState(initialData.itinerary    || []);
  const [expenses,      setExpenses]      = useState(initialData.expenses     || []);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [mode,          setMode]          = useState('checklist');
  const [listTab,       setListTab]       = useState('pretrip');
  const [isEditMode,    setIsEditMode]    = useState(false);
  const [expandedItems, setExpandedItems] = useState(new Set());
  const [isSettingsOpen,   setIsSettingsOpen]   = useState(false);
  const [isEditModalOpen,  setIsEditModalOpen]  = useState(false);
  const [editingItem,      setEditingItem]      = useState(null);
  const [addingExpenseFor, setAddingExpenseFor] = useState(null);
  const [editingExpense,   setEditingExpense]   = useState(null);
  const [isEditingName,    setIsEditingName]    = useState(false);
  const [saveStatus,       setSaveStatus]       = useState('saved'); // 'saving' | 'saved' | 'error'

  // Settings sub-state
  const [isUsersLocked,    setIsUsersLocked]    = useState(true);
  const [newUser,          setNewUser]          = useState('');
  const [newCategory,      setNewCategory]      = useState('');
  const [newCurrency,      setNewCurrency]      = useState('');
  const [newRateValue,     setNewRateValue]     = useState('');
  const [editingUserId,    setEditingUserId]    = useState(null);
  const [editUserValue,    setEditUserValue]    = useState('');
  const [editingCatId,     setEditingCatId]     = useState(null);
  const [editCatValue,     setEditCatValue]     = useState('');
  const [newChecklistItem, setNewChecklistItem] = useState('');
  const [globalShopDate,   setGlobalShopDate]   = useState('');
  const [globalShopId,     setGlobalShopId]     = useState('');
  const [globalNewShop,    setGlobalNewShop]    = useState('');
  const [modalNewShop,     setModalNewShop]     = useState('');

  const tripNameRef = useRef(null);
  const TripIcon = TRIP_ICONS[tripIconIndex % TRIP_ICONS.length];

  useEffect(() => { if (isEditingName) tripNameRef.current?.focus(); }, [isEditingName]);

  // ── Firebase auto-save (debounced 1.2 s) ─────────────────────────────────
  const payload = useMemo(() => ({
    name: tripName, iconIndex: tripIconIndex,
    users, rates, baseCurrency, categories, checklist, itinerary, expenses,
  }), [tripName, tripIconIndex, users, rates, baseCurrency, categories, checklist, itinerary, expenses]);

  const debouncedPayload = useDebounce(payload, 1200);
  const isFirstSave = useRef(true);

  useEffect(() => {
    if (isFirstSave.current) { isFirstSave.current = false; return; }
    setSaveStatus('saving');
    const ref = doc(db, 'users', uid, 'trips', tripId);
    updateDoc(ref, { ...debouncedPayload, updatedAt: serverTimestamp() })
      .then(()  => setSaveStatus('saved'))
      .catch(()  => setSaveStatus('error'));
  }, [debouncedPayload, uid, tripId]);

  // ── Date helpers ──────────────────────────────────────────────────────────
  const fmtDate = (dateStr) => {
    if (!dateStr) return '未定日期';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return `${d.getMonth()+1}/${d.getDate()}(${'日一二三四五六'[d.getDay()]})`;
  };

  const scrollToDate = (d) => document.getElementById(`date-${d}`)?.scrollIntoView({ behavior:'smooth', block:'start' });

  // ── Itinerary helpers ─────────────────────────────────────────────────────
  const sortByTime = () => setItinerary([...itinerary].sort((a,b) => {
    const da = a.date||'9999', db2 = b.date||'9999';
    return da !== db2 ? da.localeCompare(db2) : (a.time||'').localeCompare(b.time||'');
  }));

  const moveItem = (idx, dir) => {
    const arr = [...itinerary];
    if (dir === 'up'   && idx > 0)             { if (arr[idx].date !== arr[idx-1].date) arr[idx].date = arr[idx-1].date; [arr[idx-1], arr[idx]] = [arr[idx], arr[idx-1]]; }
    if (dir === 'down' && idx < arr.length-1)  { if (arr[idx].date !== arr[idx+1].date) arr[idx].date = arr[idx+1].date; [arr[idx+1], arr[idx]] = [arr[idx], arr[idx+1]]; }
    setItinerary(arr);
  };

  const saveItineraryItem = (item) => {
    if (item.id) setItinerary(itinerary.map(i => i.id === item.id ? item : i));
    else         setItinerary([...itinerary, { ...item, id: crypto.randomUUID() }]);
    setIsEditModalOpen(false);
    setModalNewShop('');
  };

  const deleteItineraryItem = async (id) => {
    if (await confirm('確定要刪除這個行程嗎？')) setItinerary(itinerary.filter(i => i.id !== id));
  };

  // ── Checklist ─────────────────────────────────────────────────────────────
  const toggleChecklist = (id) => setChecklist(checklist.map(i => i.id === id ? {...i, checked: !i.checked} : i));
  const addChecklistItem = () => {
    if (!newChecklistItem.trim()) return;
    setChecklist([...checklist, { id: crypto.randomUUID(), text: newChecklistItem, checked: false }]);
    setNewChecklistItem('');
  };
  const deleteChecklistItem = async (id) => {
    if (await confirm('刪除此清單項目？', '確認刪除')) setChecklist(checklist.filter(i => i.id !== id));
  };

  // ── Shopping ──────────────────────────────────────────────────────────────
  const toggleShop = (iId, sId) => setItinerary(itinerary.map(i => i.id === iId ? {...i, shoppingList:(i.shoppingList||[]).map(s => s.id===sId ? {...s,checked:!s.checked}:s)}:i));
  const addModalShop = () => {
    if (!modalNewShop.trim()) return;
    setEditingItem(prev => ({...prev, shoppingList:[...(prev.shoppingList||[]), {id:crypto.randomUUID(), text:modalNewShop, checked:false}]}));
    setModalNewShop('');
  };
  const delModalShop   = (sId) => setEditingItem(prev => ({...prev, shoppingList:(prev.shoppingList||[]).filter(s=>s.id!==sId)}));
  const addGlobalShop  = () => {
    if (!globalShopId || !globalNewShop.trim()) return;
    setItinerary(itinerary.map(i => i.id===globalShopId ? {...i, shoppingList:[...(i.shoppingList||[]),{id:crypto.randomUUID(),text:globalNewShop,checked:false}]}:i));
    setGlobalNewShop('');
  };
  const delGlobalShop  = async (iId, sId) => {
    if (await confirm('刪除此購物項目？','確認刪除'))
      setItinerary(itinerary.map(i => i.id===iId ? {...i,shoppingList:(i.shoppingList||[]).filter(s=>s.id!==sId)}:i));
  };

  // ── Users settings ────────────────────────────────────────────────────────
  const addUser = () => {
    if (newUser.trim() && !users.includes(newUser.trim())) { setUsers([...users, newUser.trim()]); setNewUser(''); }
  };
  const saveEditedUser = (old) => {
    const nw = editUserValue.trim();
    if (!nw || nw===old) { setEditingUserId(null); return; }
    if (users.includes(nw)) { alert('此名稱已存在！'); return; }
    setUsers(users.map(u => u===old ? nw : u));
    setExpenses(expenses.map(exp => {
      let e = {...exp};
      if (e.paidBy===old) e.paidBy=nw;
      e.splitAmong = (e.splitAmong||[]).map(u=>u===old?nw:u);
      if (e.customSplit?.[old] !== undefined) { const v=e.customSplit[old]; const cs={...e.customSplit}; delete cs[old]; cs[nw]=v; e.customSplit=cs; }
      return e;
    }));
    setEditingUserId(null);
  };
  const removeUser = async (u) => {
    if (!await confirm(`刪除「${u}」？\n系統將重新分配其相關花費。`, '確認刪除')) return;
    const remaining = users.filter(x=>x!==u);
    setUsers(remaining);
    setExpenses(expenses.map(exp => {
      let e={...exp};
      if (e.paidBy===u) e.paidBy=remaining[0]||'';
      if (e.splitMode==='custom' && e.customSplit?.[u]!==undefined) {
        const amt=Number(e.customSplit[u])||0;
        const cs={...e.customSplit}; delete cs[u];
        if (amt>0 && cs[e.paidBy]!==undefined) cs[e.paidBy]=(Number(cs[e.paidBy])||0)+amt;
        e.customSplit=cs;
      } else if (e.splitMode==='equal') {
        e.splitAmong=(e.splitAmong||[]).filter(x=>x!==u);
      }
      return e;
    }));
  };

  // ── Categories settings ───────────────────────────────────────────────────
  const addCategory    = () => { if (newCategory.trim() && !categories.includes(newCategory.trim())) { setCategories([...categories,newCategory.trim()]); setNewCategory(''); } };
  const saveEditedCat  = (old) => {
    const nw=editCatValue.trim();
    if (!nw||nw===old) { setEditingCatId(null); return; }
    if (categories.includes(nw)) { alert('此分類已存在！'); return; }
    setCategories(categories.map(c=>c===old?nw:c));
    setExpenses(expenses.map(e=>e.category===old?{...e,category:nw}:e));
    setEditingCatId(null);
  };
  const removeCat = (c) => setCategories(categories.filter(x=>x!==c));

  // ── Rates settings ────────────────────────────────────────────────────────
  const addRate    = () => { if (newCurrency.trim()&&newRateValue) { setRates({...rates,[newCurrency.trim().toUpperCase()]:parseFloat(newRateValue)}); setNewCurrency(''); setNewRateValue(''); } };
  const updateRate = (c,v) => { if (v) setRates({...rates,[c]:parseFloat(v)}); };
  const removeRate = async (c) => {
    if (c===baseCurrency) { alert('基準幣別不可刪除'); return; }
    if (await confirm(`刪除 ${c}？`,'確認刪除')) { const r={...rates}; delete r[c]; setRates(r); }
  };

  // ── Expenses ──────────────────────────────────────────────────────────────
  const saveExpense = (exp) => {
    if (exp.id) setExpenses(expenses.map(e=>e.id===exp.id?exp:e));
    else        setExpenses([...expenses,{...exp,id:crypto.randomUUID()}]);
    setAddingExpenseFor(null);
    setEditingExpense(null);
  };
  const deleteExpense = async (id) => {
    if (await confirm('確定刪除此筆紀錄？','確認刪除')) setExpenses(expenses.filter(e=>e.id!==id));
  };

  // ── Finance calculations ──────────────────────────────────────────────────
  const convertedExpenses = useMemo(() => expenses.map(exp => {
    const expRate  = rates[exp.currency]  || 1;
    const baseRate = rates[baseCurrency]  || 1;
    const baseAmount = (exp.amount * expRate) / baseRate;
    return { ...exp, baseAmount, rateUsed: expRate / baseRate };
  }), [expenses, rates, baseCurrency]);

  const financeSummary = useMemo(() => {
    let total = 0;
    const userStats = users.reduce((acc,u)=>({...acc,[u]:{paid:0,consumed:0}}),{});
    convertedExpenses.forEach(exp => {
      total += exp.baseAmount;
      if (userStats[exp.paidBy]) userStats[exp.paidBy].paid += exp.baseAmount;
      if (exp.splitMode==='custom' && exp.customSplit) {
        Object.entries(exp.customSplit).forEach(([u,amt])=>{if(userStats[u]) userStats[u].consumed+=Number(amt)*exp.rateUsed;});
      } else {
        const cnt = exp.splitAmong?.length||0;
        if (cnt>0) { const pp=exp.baseAmount/cnt; (exp.splitAmong||[]).forEach(u=>{if(userStats[u]) userStats[u].consumed+=pp;}); }
      }
    });
    return { total, userStats };
  }, [convertedExpenses, users]);

  const settlement = useMemo(() => calcSettlement(financeSummary.userStats), [financeSummary]);

  // ── Export CSV ────────────────────────────────────────────────────────────
  const exportCSV = () => {
    let csv = '\uFEFF日期/時間,關聯行程,分類,描述,總金額,幣別,付款人,' + users.map(u=>`[${u}]需付`).join(',') + '\n';
    expenses.forEach(exp => {
      const rel = itinerary.find(i=>i.id===exp.itineraryId);
      const splits = users.map(u => {
        if (exp.splitMode==='custom') return exp.customSplit?.[u]||0;
        if ((exp.splitAmong||[]).includes(u)) return +((exp.amount/(exp.splitAmong.length||1)).toFixed(2));
        return 0;
      });
      const row=[rel?rel.time:'無',rel?rel.title:'無',exp.category||'其他',exp.description,exp.amount,exp.currency,exp.paidBy,...splits].map(f=>`"${String(f).replace(/"/g,'""')}"`).join(',');
      csv+=row+'\n';
    });
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
    a.download=`${tripName}-花費明細.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  // ── Share management ──────────────────────────────────────────────────────
const addShareMember = async () => {
  const email = newShareEmail.trim().toLowerCase();
  if (!email || !email.includes('@')) { setShareStatus('請輸入正確的 Email'); return; }

  setShareStatus('🔍 查詢中...');

  try {
    // 用 Email 查詢 uid
    const profileQuery = query(
      collection(db, 'userProfiles'),
      where('email', '==', email)
    );
    const { getDocs } = await import('firebase/firestore');
    const snap = await getDocs(profileQuery);

    if (snap.empty) {
      setShareStatus('❌ 找不到此 Email，對方需要先登入過 App');
      return;
    }

    const targetUid = snap.docs[0].data().uid;

    if (targetUid === uid) { setShareStatus('❌ 不能分享給自己'); return; }
    if (shareEditors.includes(targetUid) || shareViewers.includes(targetUid)) {
      setShareStatus('此帳號已在名單中'); return;
    }

    const newEditors = newShareRole === 'editor' ? [...shareEditors, targetUid] : shareEditors;
    const newViewers = newShareRole === 'viewer' ? [...shareViewers, targetUid] : shareViewers;

    await updateDoc(doc(db, 'users', uid, 'trips', tripId), {
      editors: newEditors,
      viewers: newViewers,
      ownerId: uid,
    });
    await setDoc(doc(db, 'sharedTrips', tripId), {
      ownerUid: uid, tripId,
      editors: newEditors,
      viewers: newViewers,
    });

    setShareEditors(newEditors);
    setShareViewers(newViewers);
    setNewShareEmail('');
    setShareStatus(`✅ 已新增 ${email}`);
  } catch (e) {
    console.error(e);
    setShareStatus('❌ 儲存失敗，請再試一次');
  }
};

const removeShareMember = async (email, role) => {
  const newEditors = role === 'editor' ? shareEditors.filter(e => e !== email) : shareEditors;
  const newViewers = role === 'viewer' ? shareViewers.filter(e => e !== email) : shareViewers;
  try {
    await updateDoc(doc(db, 'users', uid, 'trips', tripId), {
      editors: newEditors,
      viewers: newViewers,
    });
    await setDoc(doc(db, 'sharedTrips', tripId), {
      ownerUid: uid, tripId,
      editors: newEditors,
      viewers: newViewers,
    });
    setShareEditors(newEditors);
    setShareViewers(newViewers);
  } catch (e) {
    alert('移除失敗');
  }
};
  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 pb-24">
      {ConfirmUI}

      {/* ── Header ── */}
      <div className="sticky top-0 z-20 bg-white shadow-sm">
        <div className="p-4 flex items-center gap-3">
          <button onClick={onBack} className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors shrink-0" title="返回旅程列表">
            <ArrowLeft size={22}/>
          </button>

          <button onClick={() => setTripIconIndex(i => (i+1) % TRIP_ICONS.length)} className="p-1.5 text-indigo-500 bg-indigo-50 hover:bg-indigo-100 rounded-lg shrink-0 transition-colors">
            <TripIcon size={22}/>
          </button>

          {isEditingName ? (
            <input ref={tripNameRef} type="text" value={tripName} onChange={e=>setTripName(e.target.value)}
              onBlur={()=>setIsEditingName(false)} onKeyDown={e=>e.key==='Enter'&&setIsEditingName(false)}
              className="text-xl font-bold text-indigo-600 bg-transparent border-b-2 border-indigo-300 outline-none flex-1"/>
          ) : (
            <h1 onClick={()=>setIsEditingName(true)}
              className="text-xl font-bold text-indigo-600 truncate flex-1 cursor-text hover:opacity-80">
              {tripName}
            </h1>
          )}

          {/* Save status */}
          <div className="shrink-0 text-xs font-medium text-slate-400 flex items-center gap-1">
            {saveStatus === 'saving' && <><span className="animate-pulse">●</span> 儲存中</>}
            {saveStatus === 'saved'  && <><span className="text-green-400">●</span> 已同步</>}
            {saveStatus === 'error'  && <><span className="text-red-400">●</span> 失敗</>}
          </div>

          <button onClick={()=>setIsSettingsOpen(true)} className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors shrink-0">
            <button onClick={()=>setIsShareOpen(true)} className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors shrink-0">
              <Share2 size={22}/>
            </button>
            <Settings size={22}/>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b overflow-x-auto whitespace-nowrap scrollbar-hide">
          {[['checklist','清單'],['itinerary','行程計畫'],['finance','記帳分帳']].map(([m,label])=>(
            <button key={m} onClick={()=>setMode(m)} className={`flex-1 py-3 px-4 text-sm font-medium border-b-2 transition-colors ${mode===m?'border-indigo-500 text-indigo-600':'border-transparent text-slate-500 hover:text-slate-700'}`}>{label}</button>
          ))}
        </div>

        {mode==='itinerary' && (
          <div className="bg-slate-50 border-b px-4 py-2 flex justify-between items-center">
            <div className="flex overflow-x-auto gap-2 scrollbar-hide flex-1 mr-4">
              {[...new Set(itinerary.map(i=>i.date))].filter(Boolean).sort().map(d=>(
                <button key={d} onClick={()=>scrollToDate(d)} className="px-3 py-1 bg-white border border-slate-200 text-slate-600 rounded-full text-xs font-bold shadow-sm hover:bg-indigo-50 hover:text-indigo-600 whitespace-nowrap transition-colors flex items-center gap-1">
                  <Calendar size={13}/> {fmtDate(d)}
                </button>
              ))}
            </div>
            <button onClick={()=>setIsEditMode(!isEditMode)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold shadow-sm whitespace-nowrap transition-colors ${isEditMode?'bg-indigo-100 text-indigo-700 border border-indigo-200':'bg-white text-slate-600 border border-slate-200'}`}>
              {isEditMode ? <><ToggleRight size={16} className="text-indigo-600"/> 編輯中</> : <><ToggleLeft size={16} className="text-slate-400"/> 瀏覽模式</>}
            </button>
          </div>
        )}
      </div>

      <div className="p-4 max-w-lg mx-auto">

        {/* ══════════════════════════════════════════════════════════════════
            CHECKLIST TAB
        ══════════════════════════════════════════════════════════════════ */}
        {mode==='checklist' && (
          <div className="space-y-4">
            <div className="flex bg-slate-200 p-1 rounded-xl mb-4">
              <button onClick={()=>setListTab('pretrip')}  className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${listTab==='pretrip' ?'bg-white shadow-sm text-indigo-600':'text-slate-500'}`}>行前清單</button>
              <button onClick={()=>setListTab('shopping')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${listTab==='shopping'?'bg-white shadow-sm text-indigo-600':'text-slate-500'}`}>各景點購物總覽</button>
            </div>

            {listTab==='pretrip' && (
              <>
                {checklist.length > 0 && (
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 mb-4">
                    <div className="flex justify-between text-xs font-bold text-slate-500 mb-2">
                      <span>準備進度</span>
                      <span>{checklist.filter(i=>i.checked).length} / {checklist.length} ({Math.round(checklist.filter(i=>i.checked).length/checklist.length*100)}%)</span>
                    </div>
                    <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 transition-all duration-500" style={{width:`${checklist.filter(i=>i.checked).length/checklist.length*100}%`}}/>
                    </div>
                  </div>
                )}
                <div className="flex gap-2 mb-6">
                  <input type="text" className="flex-1 border rounded-xl p-3 bg-white shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="新增清單項目..." value={newChecklistItem} onChange={e=>setNewChecklistItem(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addChecklistItem()}/>
                  <button onClick={addChecklistItem} className="px-4 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700"><Plus size={24}/></button>
                </div>
                <div className="space-y-2">
                  {checklist.map(item=>(
                    <div key={item.id} className="flex items-center justify-between p-3 bg-white rounded-xl shadow-sm border border-slate-200">
                      <label className="flex items-center gap-3 flex-1 cursor-pointer">
                        <input type="checkbox" className="hidden" checked={item.checked} onChange={()=>toggleChecklist(item.id)}/>
                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${item.checked?'bg-indigo-500 border-indigo-500':'border-slate-300'}`}>
                          {item.checked && <Check size={14} className="text-white"/>}
                        </div>
                        <span className={`text-slate-700 ${item.checked?'line-through opacity-50':''}`}>{item.text}</span>
                      </label>
                      <button onClick={()=>deleteChecklistItem(item.id)} className="p-2 text-slate-400 hover:text-red-500"><Trash2 size={18}/></button>
                    </div>
                  ))}
                  {checklist.length===0 && <div className="text-center py-10 text-slate-400 flex flex-col items-center gap-2"><ListTodo size={48} className="opacity-20"/><p>目前沒有清單項目</p></div>}
                </div>
              </>
            )}

            {listTab==='shopping' && (
              <div className="space-y-4">
                <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 mb-6">
                  <h3 className="font-bold text-indigo-800 text-sm mb-3">新增購物項目</h3>
                  <div className="flex gap-2 mb-3">
                    <select className="w-1/3 border border-slate-200 rounded-lg p-2.5 text-sm bg-white outline-none" value={globalShopDate} onChange={e=>{setGlobalShopDate(e.target.value);setGlobalShopId('');}}>
                      <option value="">選擇日期...</option>
                      {[...new Set(itinerary.map(i=>i.date))].filter(Boolean).sort().map(d=><option key={d} value={d}>{fmtDate(d)}</option>)}
                    </select>
                    <select className="flex-1 border border-slate-200 rounded-lg p-2.5 text-sm bg-white outline-none disabled:bg-slate-50 disabled:text-slate-400" value={globalShopId} onChange={e=>setGlobalShopId(e.target.value)} disabled={!globalShopDate}>
                      <option value="">選擇景點...</option>
                      {itinerary.filter(i=>i.date===globalShopDate).map(i=><option key={i.id} value={i.id}>{i.time} - {i.title}</option>)}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <input type="text" placeholder="輸入要購買的項目..." className="flex-1 border border-slate-200 rounded-lg p-2.5 text-sm bg-white outline-none" value={globalNewShop} onChange={e=>setGlobalNewShop(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addGlobalShop()}/>
                    <button onClick={addGlobalShop} disabled={!globalShopId||!globalNewShop.trim()} className="px-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"><Plus size={20}/></button>
                  </div>
                </div>

                {(() => {
                  const shopItems = itinerary.filter(i=>i.shoppingList&&i.shoppingList.length>0);
                  let checked=0, total=0;
                  shopItems.forEach(i=>{total+=i.shoppingList.length;checked+=i.shoppingList.filter(s=>s.checked).length;});
                  if (total===0) return <div className="text-center py-10 text-slate-400 flex flex-col items-center gap-2"><ShoppingBag size={48} className="opacity-20"/><p>目前沒有任何購物清單</p></div>;
                  return (
                    <>
                      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 mb-4">
                        <div className="flex justify-between text-xs font-bold text-slate-500 mb-2"><span>購買進度</span><span>{checked}/{total} ({Math.round(checked/total*100)}%)</span></div>
                        <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-indigo-500 transition-all duration-500" style={{width:`${checked/total*100}%`}}/></div>
                      </div>
                      {shopItems.map(item=>(
                        <div key={item.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                          <div className="flex items-center gap-1 text-sm text-indigo-600 font-bold mb-3 border-b pb-2"><MapPin size={16}/>{item.title}<span className="text-xs text-slate-400 ml-1">({fmtDate(item.date)})</span></div>
                          <div className="space-y-2">
                            {item.shoppingList.map(s=>(
                              <div key={s.id} className="flex items-center justify-between group">
                                <label className="flex items-start gap-3 cursor-pointer flex-1 pr-2">
                                  <input type="checkbox" className="hidden" checked={s.checked} onChange={()=>toggleShop(item.id,s.id)}/>
                                  <div className={`mt-0.5 w-5 h-5 shrink-0 rounded-full border-2 flex items-center justify-center transition-colors ${s.checked?'bg-indigo-500 border-indigo-500':'border-slate-300'}`}>{s.checked&&<Check size={12} className="text-white"/>}</div>
                                  <span className={`flex-1 text-sm ${s.checked?'opacity-40 line-through text-slate-500':'text-slate-700'}`}>{s.text}</span>
                                </label>
                                <button onClick={()=>delGlobalShop(item.id,s.id)} className="p-1 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={16}/></button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            ITINERARY TAB
        ══════════════════════════════════════════════════════════════════ */}
        {mode==='itinerary' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-slate-500">{isEditMode?'可修改與調整行程順序（可跨天）':'快速瀏覽行程與導航'}</span>
              {isEditMode && <button onClick={sortByTime} className="text-xs text-indigo-600 font-bold px-3 py-1.5 bg-indigo-50 rounded-full hover:bg-indigo-100 shadow-sm">依時間排序</button>}
            </div>

            {itinerary.length===0 && (
              <div className="text-center py-16 text-slate-400 flex flex-col items-center gap-3">
                <MapPin size={48} className="opacity-20"/>
                <p className="font-medium">還沒有行程</p>
                <p className="text-xs">切換到「編輯中」模式，然後點下方按鈕新增第一站</p>
                {!isEditMode && <button onClick={()=>setIsEditMode(true)} className="mt-2 px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl">開始編輯行程</button>}
              </div>
            )}

            {(() => {
              const byDate = itinerary.reduce((acc,i)=>{const d=i.date||'未定日期';(acc[d]=acc[d]||[]).push(i);return acc;},{});
              return Object.keys(byDate).sort().map(dateStr=>(
                <div id={`date-${dateStr}`} key={dateStr} className="scroll-mt-36 mb-8">
                  <div className="mb-5 flex items-center gap-3">
                    <h2 className="text-lg font-bold text-indigo-800 bg-indigo-100 px-4 py-1.5 rounded-full shadow-sm border border-indigo-200">{fmtDate(dateStr)}</h2>
                    <div className="h-px bg-indigo-200 flex-1"/>
                  </div>

                  {isEditMode ? (
                    <div className="space-y-3">
                      {byDate[dateStr].map((item, dayIdx)=>{
                        const gi = itinerary.findIndex(i=>i.id===item.id);
                        const prev = dayIdx>0 ? byDate[dateStr][dayIdx-1] : null;
                        const warn = prev && (item.time||'')<(prev.time||'');
                        return (
                          <div key={item.id} className={`bg-white rounded-xl shadow-sm border p-3 flex gap-3 items-center transition-colors ${warn?'border-red-300 bg-red-50':'border-slate-200'}`}>
                            <div className="flex flex-col gap-1">
                              <button onClick={()=>moveItem(gi,'up')}   disabled={gi===0}                   className="p-1 text-slate-400 hover:text-indigo-600 disabled:opacity-20"><ChevronUp   size={20}/></button>
                              <button onClick={()=>moveItem(gi,'down')} disabled={gi===itinerary.length-1} className="p-1 text-slate-400 hover:text-indigo-600 disabled:opacity-20"><ChevronDown size={20}/></button>
                            </div>
                            <div className="flex-1 min-w-0 cursor-pointer" onClick={()=>{setEditingItem(item);setIsEditModalOpen(true);}}>
                              <div className="flex items-center gap-2 mb-1">
                                <span className={`font-bold text-sm ${warn?'text-red-600':'text-indigo-600'}`}>{item.time}{warn&&' ⚠️'}</span>
                                <span className="font-bold truncate text-slate-800">{item.title}</span>
                              </div>
                              <div className="text-xs text-slate-500 truncate flex items-center gap-1"><MapPin size={12}/>{item.location||'無地點'}</div>
                            </div>
                            <div className="flex gap-2">
                              <button onClick={()=>{setEditingItem(item);setIsEditModalOpen(true);}} className="p-2 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg"><Edit2 size={16}/></button>
                              <button onClick={()=>deleteItineraryItem(item.id)}                    className="p-2 text-red-600  bg-red-50  hover:bg-red-100  rounded-lg"><Trash2 size={16}/></button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="relative border-l-2 border-indigo-200 ml-4 space-y-8 pb-4">
                      {byDate[dateStr].map((item,dayIdx)=>{
                        const next = byDate[dateStr][dayIdx+1];
                        return (
                          <div key={item.id} className="relative pl-6">
                            <div className="absolute -left-[9px] top-1 w-4 h-4 bg-indigo-500 rounded-full border-4 border-slate-50"/>
                            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
                              <div className="flex items-center gap-2 text-indigo-600 font-bold mb-1"><Clock size={16}/>{item.time}</div>
                              <div className="flex justify-between items-start cursor-pointer group mb-2" onClick={()=>setExpandedItems(prev=>{const s=new Set(prev);s.has(item.id)?s.delete(item.id):s.add(item.id);return s;})}>
                                <h3 className="text-lg font-bold group-hover:text-indigo-600 pr-2">{item.title}</h3>
                                {expandedItems.has(item.id) ? <ChevronUp size={20} className="text-slate-400 shrink-0 mt-0.5"/> : <ChevronDown size={20} className="text-slate-400 shrink-0 mt-0.5"/>}
                              </div>
                              {item.location && (
                                <div className="flex items-start gap-2 text-slate-600 mb-2 text-sm">
                                  <MapPin size={16} className="mt-0.5 shrink-0 text-red-500"/>
                                  <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.location)}`} target="_blank" rel="noreferrer" className="hover:underline text-blue-600">{item.location}</a>
                                </div>
                              )}
                              <div className="flex flex-wrap gap-2 mb-3">
                                {item.website    && <a href={item.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100"><Globe size={12}/>官網</a>}
                                {item.shoppingList?.length>0 && <span className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-pink-50 text-pink-600 rounded-full"><ShoppingBag size={12}/>購物清單 ({item.shoppingList.length})</span>}
                                {item.tickets    && <span className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-amber-50 text-amber-600 rounded-full"><Ticket size={12}/>門票</span>}
                              </div>
                              {expandedItems.has(item.id) && (
                                <div className="mt-3 pt-3 border-t border-slate-100 space-y-3 mb-3">
                                  {(item.notes||item.hours) && (
                                    <div className="bg-slate-50 p-3 rounded-lg text-sm space-y-1">
                                      {item.hours && <p className="flex items-center gap-2"><Clock size={14} className="text-slate-400"/>{item.hours}</p>}
                                      {item.notes && <p className="text-slate-700">{item.notes}</p>}
                                    </div>
                                  )}
                                  {item.shoppingList?.length>0 && (
                                    <div className="bg-pink-50/50 p-3 rounded-lg text-sm border border-pink-100">
                                      <div className="font-bold text-pink-700 flex items-center gap-1 mb-2"><ShoppingBag size={14}/>預計購買項目</div>
                                      {item.shoppingList.map(s=>(
                                        <div key={s.id} className={`flex items-start gap-2 mb-1 ${s.checked?'opacity-50 line-through text-slate-500':'text-pink-800'}`}>
                                          <Check size={14} className={`mt-0.5 shrink-0 ${s.checked?'text-pink-500':'text-transparent border border-pink-300 rounded-sm'}`}/>
                                          {s.text}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {item.tickets && (
                                    <div className="bg-amber-50/50 p-3 rounded-lg text-sm border border-amber-100">
                                      <div className="font-bold text-amber-700 flex items-center gap-1 mb-1"><Ticket size={14}/>門票資訊</div>
                                      <div className="text-amber-800 whitespace-pre-wrap">{item.tickets}</div>
                                    </div>
                                  )}
                                </div>
                              )}
                              <div className="flex gap-2 border-t pt-3">
                                <button onClick={()=>setAddingExpenseFor(item)} className="flex-1 flex justify-center items-center gap-1 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200"><DollarSign size={16}/>記一筆</button>
                                {next?.location && (
                                  <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(next.location)}`} target="_blank" rel="noreferrer" className="flex-1 flex justify-center items-center gap-1 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 shadow-sm"><Navigation size={16}/>導航下一站</a>
                                )}
                              </div>
                            </div>
                            {item.transport && next && <div className="mt-4 flex items-center gap-2 text-sm text-slate-500 bg-slate-100 w-max px-3 py-1 rounded-full ml-2 border border-slate-200"><Car size={14}/>交通：{item.transport}</div>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ));
            })()}

            {isEditMode && (
              <button onClick={()=>{
                const dates=[...new Set(itinerary.map(i=>i.date))].filter(Boolean).sort();
                const last = dates.length>0 ? dates[dates.length-1] : new Date().toISOString().split('T')[0];
                setEditingItem({date:last,title:'',time:'12:00',location:'',transport:'',notes:'',website:'',hours:'',shoppingList:[],tickets:''});
                setIsEditModalOpen(true);
              }} className="w-full py-3 border-2 border-dashed border-indigo-300 text-indigo-600 font-bold rounded-xl flex justify-center items-center gap-2 hover:bg-indigo-50 transition-colors">
                <Plus size={20}/> 新增行程景點
              </button>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            FINANCE TAB
        ══════════════════════════════════════════════════════════════════ */}
        {mode==='finance' && (
          <div className="space-y-6">
            {/* Summary card */}
            <div className="bg-indigo-600 rounded-2xl p-5 text-white shadow-md">
              <div className="text-indigo-200 text-sm mb-1">總花費 ({baseCurrency})</div>
              <div className="text-3xl font-bold mb-4 flex items-center gap-1"><DollarSign size={28}/>{Math.round(financeSummary.total).toLocaleString()}</div>
              <div className="space-y-3 mt-4 border-t border-indigo-500 pt-4">
                <div className="text-sm font-medium mb-2 flex items-center gap-1"><PieChart size={16}/>個人分攤概況</div>
                {users.map(u=>{
                  const s=financeSummary.userStats[u];
                  if(!s) return null;
                  const bal=s.paid-s.consumed;
                  return (
                    <div key={u} className="flex justify-between items-center text-sm">
                      <span className="font-medium truncate max-w-[80px]">{u}</span>
                      <div className="flex flex-col items-end">
                        <span className="text-indigo-200 text-xs">應付: ${Math.round(s.consumed).toLocaleString()} | 已付: ${Math.round(s.paid).toLocaleString()}</span>
                        <span className={`font-bold ${bal>0?'text-green-300':bal<0?'text-red-300':'text-white'}`}>
                          {bal>0?'需收款':bal<0?'需付款':'結清'} ${Math.abs(Math.round(bal)).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Settlement panel ── */}
            {settlement.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                <h3 className="font-bold text-slate-700 mb-3 flex items-center gap-2 text-sm"><Users size={16} className="text-indigo-500"/>建議結算清單</h3>
                <div className="space-y-2">
                  {settlement.map((t,i)=>(
                    <div key={i} className="flex items-center gap-2 text-sm bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
                      <span className="font-bold text-red-500">{t.from}</span>
                      <ArrowRight size={14} className="text-slate-400 shrink-0"/>
                      <span className="font-bold text-green-600">{t.to}</span>
                      <span className="ml-auto font-bold text-slate-700">{baseCurrency} {t.amount.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slate-400 mt-3">依據上方分攤設定自動計算，最少交易筆數完成結清。</p>
              </div>
            )}
            {settlement.length===0 && expenses.length>0 && (
              <div className="text-center py-3 bg-green-50 rounded-2xl border border-green-100">
                <p className="text-green-600 font-bold text-sm">🎉 所有人已結清，無需轉帳！</p>
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={()=>setAddingExpenseFor({title:'一般花費'})} className="flex-1 py-3 bg-white border border-slate-200 text-slate-800 font-bold rounded-xl flex justify-center items-center gap-2 shadow-sm hover:bg-slate-50"><Plus size={18}/>記一筆</button>
              <button onClick={exportCSV}                                   className="flex-1 py-3 bg-white border border-slate-200 text-slate-800 font-bold rounded-xl flex justify-center items-center gap-2 shadow-sm hover:bg-slate-50"><Download size={18}/>匯出 CSV</button>
            </div>

            <div className="space-y-3">
              <h3 className="font-bold text-slate-700 ml-1">帳務明細</h3>
              {expenses.length===0 && <div className="text-center text-slate-400 py-4">尚無記帳紀錄</div>}
              {expenses.map(exp=>{
                const rel=itinerary.find(i=>i.id===exp.itineraryId);
                return (
                  <div key={exp.id} onClick={()=>setEditingExpense(exp)} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center cursor-pointer hover:border-indigo-300 hover:shadow-md transition-all group">
                    <div className="flex-1 min-w-0 pr-3">
                      <div className="font-bold text-slate-800 group-hover:text-indigo-700 flex items-center gap-2 truncate">
                        {exp.description} <Edit2 size={14} className="opacity-0 group-hover:opacity-100 text-indigo-400 shrink-0"/>
                      </div>
                      <div className="text-xs mt-1 flex flex-wrap gap-2 items-center">
                        <span className="bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded flex items-center gap-0.5"><Tag size={10}/>{exp.category||'其他'}</span>
                        <span className="text-slate-500">付: {exp.paidBy}</span>
                        <span className="text-slate-500">分: {exp.splitMode==='custom'?'自訂':(exp.splitAmong||[]).join(',')}</span>
                        {rel && <span className="text-indigo-500 truncate">📍 {rel.title}</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-bold text-red-500">{exp.amount} {exp.currency}</div>
                      <button onClick={e=>{e.stopPropagation();deleteExpense(exp.id);}} className="text-xs text-slate-400 hover:text-red-500 mt-1 px-2 py-1 rounded hover:bg-red-50 transition-colors">刪除</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          SETTINGS MODAL
      ══════════════════════════════════════════════════════════════════ */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="sticky top-0 bg-white/95 backdrop-blur-sm p-4 border-b flex justify-between items-center z-10">
              <h2 className="font-bold text-lg flex items-center gap-2"><Settings size={20} className="text-indigo-600"/>系統設定</h2>
              <button onClick={()=>setIsSettingsOpen(false)} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200"><X size={20}/></button>
            </div>
            <div className="p-5 space-y-8">

              {/* Users */}
              <div className="space-y-3">
                <div className="flex justify-between items-center border-b pb-2">
                  <h3 className="font-bold text-slate-700 flex items-center gap-1.5"><Users size={16} className="text-indigo-500"/>參與人員管理</h3>
                  <button onClick={()=>setIsUsersLocked(!isUsersLocked)} className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full font-bold transition-colors ${isUsersLocked?'bg-slate-100 text-slate-500 hover:bg-slate-200':'bg-red-50 text-red-600 hover:bg-red-100'}`}>
                    {isUsersLocked ? <><Lock size={12}/>已鎖定</> : <><Unlock size={12}/>編輯中</>}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {users.map(u=>(
                    <div key={u} className="bg-slate-50 border border-slate-200 text-slate-700 px-3 py-1.5 rounded-full text-sm font-medium flex items-center gap-2">
                      {editingUserId===u ? (
                        <div className="flex items-center gap-1">
                          <input autoFocus type="text" className="w-20 border-b border-indigo-400 bg-transparent outline-none text-center px-1" value={editUserValue} onChange={e=>setEditUserValue(e.target.value)} onKeyDown={e=>e.key==='Enter'&&saveEditedUser(u)}/>
                          <button onClick={()=>saveEditedUser(u)} className="text-green-600"><Save size={14}/></button>
                          <button onClick={()=>setEditingUserId(null)} className="text-slate-400"><X size={14}/></button>
                        </div>
                      ) : (
                        <>{u}{!isUsersLocked&&<div className="flex items-center gap-1"><button onClick={()=>{setEditingUserId(u);setEditUserValue(u);}} className="text-slate-300 hover:text-indigo-500"><Edit2 size={14}/></button><button onClick={()=>removeUser(u)} className="text-slate-300 hover:text-red-500"><X size={14}/></button></div>}</>
                      )}
                    </div>
                  ))}
                </div>
                {!isUsersLocked && (
                  <div className="flex gap-2">
                    <input type="text" value={newUser} onChange={e=>setNewUser(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addUser()} placeholder="輸入新成員名字..." className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-400"/>
                    <button onClick={addUser} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-700">新增</button>
                  </div>
                )}
                {isUsersLocked && <p className="text-xs text-slate-400">解鎖後可新增或刪除成員。刪除時系統將自動重新分配花費。</p>}
              </div>

              {/* Categories */}
              <div className="space-y-3">
                <div className="border-b pb-2"><h3 className="font-bold text-slate-700 flex items-center gap-1.5"><Tag size={16} className="text-indigo-500"/>記帳分類管理</h3></div>
                <div className="flex flex-wrap gap-2">
                  {categories.map(c=>(
                    <div key={c} className="bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-md text-xs font-bold flex items-center gap-1">
                      {editingCatId===c ? (
                        <div className="flex items-center gap-1">
                          <input autoFocus type="text" className="w-16 border-b border-indigo-400 bg-transparent outline-none text-center" value={editCatValue} onChange={e=>setEditCatValue(e.target.value)} onKeyDown={e=>e.key==='Enter'&&saveEditedCat(c)}/>
                          <button onClick={()=>saveEditedCat(c)} className="text-green-600"><Save size={12}/></button>
                          <button onClick={()=>setEditingCatId(null)} className="text-slate-400"><X size={12}/></button>
                        </div>
                      ) : (
                        <>{c}<button onClick={()=>{setEditingCatId(c);setEditCatValue(c);}} className="text-indigo-200 hover:text-indigo-500"><Edit2 size={12}/></button><button onClick={()=>removeCat(c)} className="text-indigo-200 hover:text-red-500"><X size={12}/></button></>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input type="text" value={newCategory} onChange={e=>setNewCategory(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addCategory()} placeholder="新增分類..." className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-400"/>
                  <button onClick={addCategory} className="bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-slate-300">新增</button>
                </div>
              </div>

              {/* Exchange rates */}
              <div className="space-y-3">
                <div className="border-b pb-2 flex justify-between items-center"><h3 className="font-bold text-slate-700 flex items-center gap-1.5"><Globe size={16} className="text-indigo-500"/>匯率設定</h3><span className="text-xs text-slate-400">基準: {baseCurrency}</span></div>
                <p className="text-xs text-slate-400">各幣別的值 = 1 單位該幣 = 多少 TWD（台幣為基準）</p>
                <div className="space-y-2">
                  {Object.entries(rates).map(([c,r])=>(
                    <div key={c} className={`flex justify-between items-center p-2 rounded-lg text-sm border ${c===baseCurrency?'bg-indigo-50 border-indigo-200':'bg-slate-50 border-slate-100'}`}>
                      <div className="flex items-center gap-2 w-20">
                        <span className={`font-bold ${c===baseCurrency?'text-indigo-700':''}`}>{c}</span>
                        {c===baseCurrency && <Star size={12} className="text-amber-400 fill-amber-400"/>}
                      </div>
                      <div className="flex items-center gap-2 flex-1">
                        <input type="number" step="0.0001" className={`flex-1 border-b bg-transparent text-right outline-none focus:border-indigo-400 ${c===baseCurrency?'border-indigo-200 text-indigo-700 font-bold':'border-slate-300'}`} value={r} onChange={e=>updateRate(c,e.target.value)} disabled={c===baseCurrency}/>
                        <div className="flex items-center gap-1 ml-2 w-14 justify-end">
                          {c!==baseCurrency && <>
                            <button onClick={()=>setBaseCurrency(c)} className="text-slate-300 hover:text-amber-500" title="設為基準幣別"><Star size={16}/></button>
                            <button onClick={()=>removeRate(c)} className="text-slate-400 hover:text-red-500"><X size={16}/></button>
                          </>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input type="text" value={newCurrency} onChange={e=>setNewCurrency(e.target.value.toUpperCase())} placeholder="幣別 (如: EUR)" maxLength="3" className="w-1/3 border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white outline-none uppercase"/>
                  <input type="number" step="0.001" value={newRateValue} onChange={e=>setNewRateValue(e.target.value)} placeholder="對 TWD 匯率" className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white outline-none"/>
                  <button onClick={addRate} className="bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-slate-300">新增</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

{/* ══════════════════════════════════════════════════════════════════
    SHARE MODAL
══════════════════════════════════════════════════════════════════ */}
{isShareOpen && (
  <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
    <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl max-h-[90vh] overflow-y-auto shadow-xl">
      <div className="sticky top-0 bg-white/95 backdrop-blur-sm p-4 border-b flex justify-between items-center z-10">
        <h2 className="font-bold text-lg flex items-center gap-2"><Share2 size={20} className="text-indigo-600"/>分享行程</h2>
        <button onClick={()=>{setIsShareOpen(false);setShareStatus('');}} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200"><X size={20}/></button>
      </div>
      <div className="p-5 space-y-6">

        {/* 新增成員 */}
        <div className="space-y-3">
          <h3 className="font-bold text-slate-700 text-sm border-b pb-2">新增共享成員</h3>
          <input
            type="email"
            placeholder="輸入對方的 Gmail..."
            value={newShareEmail}
            onChange={e=>{setNewShareEmail(e.target.value);setShareStatus('');}}
            className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <div className="flex gap-2">
            <button
              onClick={()=>setNewShareRole('viewer')}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-colors ${newShareRole==='viewer'?'border-indigo-500 bg-indigo-50 text-indigo-700':'border-slate-200 text-slate-500'}`}
            >👁 只能查看</button>
            <button
              onClick={()=>setNewShareRole('editor')}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-colors ${newShareRole==='editor'?'border-indigo-500 bg-indigo-50 text-indigo-700':'border-slate-200 text-slate-500'}`}
            >✏️ 可以編輯</button>
          </div>
          <button
            onClick={addShareMember}
            className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700"
          >新增成員</button>
          {shareStatus && <p className="text-sm text-center text-slate-600">{shareStatus}</p>}
        </div>

        {/* 目前編輯者 */}
        {shareEditors.length > 0 && (
          <div className="space-y-2">
            <h3 className="font-bold text-slate-700 text-sm flex items-center gap-1">✏️ 可編輯（{shareEditors.length}）</h3>
            {shareEditors.map(email=>(
              <div key={email} className="flex justify-between items-center bg-indigo-50 border border-indigo-100 px-4 py-3 rounded-xl text-sm">
                <span className="text-indigo-800 font-medium truncate flex-1">{email}</span>
                <button onClick={()=>removeShareMember(email,'editor')} className="text-slate-400 hover:text-red-500 ml-2"><X size={16}/></button>
              </div>
            ))}
          </div>
        )}

        {/* 目前瀏覽者 */}
        {shareViewers.length > 0 && (
          <div className="space-y-2">
            <h3 className="font-bold text-slate-700 text-sm flex items-center gap-1">👁 只能查看（{shareViewers.length}）</h3>
            {shareViewers.map(email=>(
              <div key={email} className="flex justify-between items-center bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-sm">
                <span className="text-slate-700 font-medium truncate flex-1">{email}</span>
                <button onClick={()=>removeShareMember(email,'viewer')} className="text-slate-400 hover:text-red-500 ml-2"><X size={16}/></button>
              </div>
            ))}
          </div>
        )}

        {shareEditors.length===0 && shareViewers.length===0 && (
          <div className="text-center py-4 text-slate-400 text-sm">尚未分享給任何人</div>
        )}

        <p className="text-xs text-slate-400 text-center">對方需要先登入 App，才能看到被分享的行程</p>
      </div>
    </div>
  </div>
)}

      {/* ══════════════════════════════════════════════════════════════════
          EDIT ITINERARY MODAL
      ══════════════════════════════════════════════════════════════════ */}
      {isEditModalOpen && editingItem && (
        <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="sticky top-0 bg-white/95 backdrop-blur-sm p-4 border-b flex justify-between items-center z-10">
              <h2 className="font-bold text-lg">{editingItem.id?'編輯行程':'新增行程'}</h2>
              <button onClick={()=>setIsEditModalOpen(false)} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200"><X size={20}/></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-4 gap-3">
                <div className="col-span-2"><label className="block text-xs font-bold text-slate-500 mb-1">日期</label><input type="date" className="w-full border rounded-lg p-2 text-sm bg-slate-50" value={editingItem.date||''} onChange={e=>setEditingItem({...editingItem,date:e.target.value})}/></div>
                <div className="col-span-2"><label className="block text-xs font-bold text-slate-500 mb-1">時間</label><input type="time" className="w-full border rounded-lg p-2 text-sm bg-slate-50" value={editingItem.time||''} onChange={e=>setEditingItem({...editingItem,time:e.target.value})}/></div>
              </div>
              <div><label className="block text-xs font-bold text-slate-500 mb-1">景點 / 標題</label><input type="text" className="w-full border rounded-lg p-2 text-sm bg-slate-50 focus:ring-2 focus:ring-indigo-300 outline-none" placeholder="例如：奇美博物館" value={editingItem.title||''} onChange={e=>setEditingItem({...editingItem,title:e.target.value})}/></div>
              <div><label className="block text-xs font-bold text-slate-500 mb-1">地點（供 Google 地圖搜尋）</label><div className="relative"><MapPin size={16} className="absolute left-3 top-2.5 text-slate-400"/><input type="text" className="w-full border rounded-lg p-2 pl-9 text-sm bg-slate-50 focus:ring-2 focus:ring-indigo-300 outline-none" placeholder="地址或地標名稱" value={editingItem.location||''} onChange={e=>setEditingItem({...editingItem,location:e.target.value})}/></div></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-bold text-slate-500 mb-1">前往下一站交通</label><input type="text" className="w-full border rounded-lg p-2 text-sm bg-slate-50 focus:ring-2 focus:ring-indigo-300 outline-none" placeholder="如：走路、公車" value={editingItem.transport||''} onChange={e=>setEditingItem({...editingItem,transport:e.target.value})}/></div>
                <div><label className="block text-xs font-bold text-slate-500 mb-1">營業時間</label><input type="text" className="w-full border rounded-lg p-2 text-sm bg-slate-50 focus:ring-2 focus:ring-indigo-300 outline-none" placeholder="如：10:00-22:00" value={editingItem.hours||''} onChange={e=>setEditingItem({...editingItem,hours:e.target.value})}/></div>
              </div>
              <div><label className="block text-xs font-bold text-slate-500 mb-1">官方網站</label><input type="url" className="w-full border rounded-lg p-2 text-sm bg-slate-50 focus:ring-2 focus:ring-indigo-300 outline-none" placeholder="https://" value={editingItem.website||''} onChange={e=>setEditingItem({...editingItem,website:e.target.value})}/></div>
              <div><label className="block text-xs font-bold text-slate-500 mb-1">備註 / 提醒</label><textarea className="w-full border rounded-lg p-2 text-sm bg-slate-50 h-20 focus:ring-2 focus:ring-indigo-300 outline-none" placeholder="注意事項..." value={editingItem.notes||''} onChange={e=>setEditingItem({...editingItem,notes:e.target.value})}/></div>
              <div className="p-3 bg-slate-100 rounded-xl space-y-3">
                <label className="block text-xs font-bold text-slate-700 flex items-center gap-1"><ShoppingBag size={14}/>購物清單</label>
                <div className="space-y-2">
                  {(editingItem.shoppingList||[]).map(s=>(
                    <div key={s.id} className="flex justify-between items-center bg-white border p-2 rounded-lg text-sm"><span className="truncate flex-1">{s.text}</span><button onClick={()=>delModalShop(s.id)} className="text-slate-400 hover:text-red-500 p-1"><X size={14}/></button></div>
                  ))}
                  {!(editingItem.shoppingList?.length>0) && <div className="text-xs text-slate-400 py-1">目前無項目</div>}
                </div>
                <div className="flex gap-2">
                  <input type="text" className="flex-1 border rounded-lg px-2 py-1.5 text-sm outline-none focus:border-indigo-400" placeholder="要買什麼..." value={modalNewShop} onChange={e=>setModalNewShop(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addModalShop()}/>
                  <button onClick={addModalShop} className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold">新增</button>
                </div>
              </div>
              <div><label className="block text-xs font-bold text-slate-500 mb-1">門票資訊</label><input type="text" className="w-full border rounded-lg p-2 text-sm bg-slate-50 focus:ring-2 focus:ring-indigo-300 outline-none" placeholder="票價或購票狀況" value={editingItem.tickets||''} onChange={e=>setEditingItem({...editingItem,tickets:e.target.value})}/></div>
              <div className="pt-4 pb-4">
                <button onClick={()=>saveItineraryItem(editingItem)} className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-md hover:bg-indigo-700">儲存行程</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Expense Modals */}
      {addingExpenseFor && <ExpenseFormModal expenseItem={addingExpenseFor} users={users} rates={rates} categories={categories} onSave={saveExpense} onClose={()=>setAddingExpenseFor(null)}/>}
      {editingExpense    && <ExpenseFormModal key={`edit-${editingExpense.id}`} initialData={editingExpense} expenseItem={itinerary.find(i=>i.id===editingExpense.itineraryId)||{title:'一般花費'}} users={users} rates={rates} categories={categories} onSave={saveExpense} onClose={()=>setEditingExpense(null)}/>}
    </div>
  );
}
