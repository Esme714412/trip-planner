/**
 * TripApp — Redo Design System
 *
 * Color tokens:
 *   --orange   : #FA9819   (primary accent)
 *   --blue-tint: #B6C9CF   (secondary / muted)
 *   --ink      : #111111   (headings)
 *   --body     : #444444   (body text)
 *   --muted    : #9CA3AF   (placeholder / disabled)
 *   --surface  : #F7F7F5   (page bg)
 *   --card     : #FFFFFF   (card bg)
 *   --border   : #E5E5E2   (dividers)
 */
import React, { useState, useMemo } from 'react';
import {
  MapPin, Clock, Globe, ShoppingBag, Ticket, Navigation,
  Car, Plus, Edit2, Trash2, DollarSign,
  ChevronDown, ChevronUp, Check, X,
  ListTodo, Calendar, Settings,
  Star, Plane, Luggage, Camera as CameraIcon,
  ArrowLeft, ArrowRight, Share2,
  Wallet, Map, CheckSquare, MoreHorizontal,
} from 'lucide-react';

/* ── Design tokens ── */
const C = {
  primary      : '#48749E',
  primaryLight : '#EAF0F6',
  primaryDark  : '#2F5478',   // hover / active
  warning      : '#FA9819',   // 警示 / 提醒
  warningLight : '#FEF3E0',
  ink          : '#111111',
  body         : '#444444',
  muted        : '#9CA3AF',
  surface      : '#FFFFFF',   // 純白背景
  card         : '#FFFFFF',
  border       : '#E8ECF0',
  danger       : '#E53E3E',
  dangerLight  : '#FFF0F0',
  // 卡片暈影 helper (直接用在 boxShadow)
  cardShadow   : '0 2px 12px rgba(72,116,158,0.10), 0 1px 3px rgba(0,0,0,0.04)',
};

// ─── 常數 ─────────────────────────────────────────────────────────────────────
const TRIP_ICONS  = [Plane, MapPin, Luggage, CameraIcon];

// 交通工具 Emoji 對照（可依需求擴充）
const TRANSPORT_EMOJI = {
  '飛機': '✈️', '航班': '✈️',
  '電車': '🚃', '捷運': '🚇', '地鐵': '🚇', '鐵路': '🚆', '新幹線': '🚄',
  '巴士': '🚌', '公車': '🚌',
  '船': '🚢', '渡輪': '⛴️',
  '計程車': '🚕', '包車': '🚗', '自駕': '🚗',
  '步行': '🚶', '徒步': '🚶',
  '纜車': '🚡', '接駁': '🚐',
};
const getTransportEmoji = (mode) => {
  if (!mode) return '🚌';
  const match = Object.keys(TRANSPORT_EMOJI).find(k => mode.includes(k));
  return match ? TRANSPORT_EMOJI[match] : '🚌';
};


// ─── Utils ────────────────────────────────────────────────────────────────────
function getDatesInRange(start, end) {
  if (!start || !end) return [];
  const dates = [], cur = new Date(start), last = new Date(end);
  while (cur <= last) {
    dates.push(cur.toISOString().split('T')[0]);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function calcSettlement(userStats) {
  const balances  = Object.entries(userStats).map(([name, s]) => ({ name, balance: Math.round(s.paid - s.consumed) }));
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

// ─── Mock 初始資料（之後換成 props / Firebase）────────────────────────────────
const MOCK_DATA = {
  name: '日本關西之旅',
  iconIndex: 0,
  tripStartDate: '2025-05-01',
  tripEndDate: '2025-05-07',
  users: ['小明', '小花'],
  baseCurrency: 'TWD',
  rates: { TWD: 1, JPY: 0.21, USD: 31.5 },
  categories: ['飲食', '交通', '住宿', '購物', '娛樂', '門票', '其他'],
  checklist: [
    { id: '1', text: '訂機票', checked: true },
    { id: '2', text: '訂飯店', checked: false },
    { id: '3', text: '換日幣', checked: false },
  ],
  itinerary: [
    { id: 'a', date: '2025-05-01', time: '09:00', type: 'place', title: '關西國際機場', location: '大阪府泉佐野市', notes: '入境後換 IC 卡', shoppingList: [], hours: '24hr', tickets: '', website: '' },
    {
      id: 'tr1', date: '2025-05-01', time: '11:30', type: 'transport',
      transportMode: '電車',       // 交通工具種類
      from: '關西空港',             // 出發地
      to: '難波',                   // 抵達地
      duration: '40 分鐘',          // 行駛時間
      title: '南海電鐵空港急行',    // 列車/班次名稱
      notes: '搭乘南海電鐵空港急行，在難波站下車',
      hours: '11:30', tickets: 'JPY 920', website: 'https://www.nankai.co.jp',
      location: '難波',
    },
    { id: 'b', date: '2025-05-01', time: '14:00', type: 'place', title: '道頓堀', location: '大阪市中央區', notes: '吃章魚燒', shoppingList: [{ id: 's1', text: '章魚燒伴手禮', checked: false }], hours: '全天', tickets: '', website: '' },
  ],
  expenses: [
    { id: 'e1', itineraryId: 'b', title: '午餐', amount: 1200, currency: 'TWD', category: '飲食', paidBy: '小明', splitWith: ['小明', '小花'], date: '2025-05-01' },
  ],
  accommodations: [
    { date: '2025-05-01', name: 'APA Hotel 道頓堀', location: '大阪市中央區' },
  ],
  savedSpots: [],
  flexTodos: [],
};

// ─── Main Component ───────────────────────────────────────────────────────────
export default function TripApp({ initialData = MOCK_DATA, readOnly = false, onBack }) {
  // ── Core state ──────────────────────────────────────────────────────────────
  const [tripName,       setTripName]       = useState(initialData.name          || '新旅程');
  const [tripIconIndex,  setTripIconIndex]  = useState(initialData.iconIndex     ?? 0);
  const [tripStartDate,  setTripStartDate]  = useState(initialData.tripStartDate || '');
  const [tripEndDate,    setTripEndDate]    = useState(initialData.tripEndDate   || '');
  const [users,          setUsers]          = useState(initialData.users         || ['自己']);
  const [rates,          setRates]          = useState(initialData.rates         || { TWD: 1 });
  const [baseCurrency,   setBaseCurrency]   = useState(initialData.baseCurrency  || 'TWD');
  const [categories,     setCategories]     = useState(initialData.categories    || ['飲食', '交通', '住宿', '其他']);
  const [checklist,      setChecklist]      = useState(initialData.checklist     || []);
  const [itinerary,      setItinerary]      = useState(initialData.itinerary     || []);
  const [expenses,       setExpenses]       = useState(initialData.expenses      || []);
  const [accommodations, setAccommodations] = useState(initialData.accommodations|| []);
  const [savedSpots,     setSavedSpots]     = useState(initialData.savedSpots    || []);

  // ── UI state ────────────────────────────────────────────────────────────────
  const [mode,           setMode]           = useState('itinerary');
  const [listTab,        setListTab]        = useState('pretrip');
  const [isEditMode,     setIsEditMode]     = useState(false);
  const [expandedItems,  setExpandedItems]  = useState(new Set());
  const [selectedDay,    setSelectedDay]    = useState(0);
  const [isEditingName,  setIsEditingName]  = useState(false);
  const [isEditingDates, setIsEditingDates] = useState(false);
  const [showDoneTickets,setShowDoneTickets]= useState(false);
  const [showDoneRegular,setShowDoneRegular]= useState(false);
  const [newChecklistItem, setNewChecklistItem] = useState('');
  const [toast,          setToast]          = useState('');
  // inline 編輯表單資料（key = item.id）
  const [inlineEdits,    setInlineEdits]    = useState({});
  const setInlineField = (id, field, val) =>
    setInlineEdits(prev => ({...prev, [id]: {...(prev[id]||{}), [field]: val}}));
  // 編輯模式展開的卡片 id（點 ... 展開 inline 表單）
  const [editExpandedId, setEditExpandedId] = useState(null);
  const toggleEditExpand = (id) =>
    setEditExpandedId(prev => prev === id ? null : id);
  // 點選移動
  const [movingItemId,   setMovingItemId]   = useState(null);
  // 各天 section 的 ref，用於快速捲動
  const dayRefs = React.useRef({});
  const itineraryScrollRef = React.useRef(null);
  // 卡片詳情 / 編輯 Sheet
  const [detailSheet,    setDetailSheet]    = useState(null); // item object
  const [detailEditing,  setDetailEditing]  = useState(false);
  const [detailData,     setDetailData]     = useState({});
  // 左滑刪除：記錄哪張卡片正在 swiped
  const [swipedId,       setSwipedId]       = useState(null);
  // FAB 展開狀態
  const [fabOpen,        setFabOpen]        = useState(false);

  const TripIcon = TRIP_ICONS[tripIconIndex % TRIP_ICONS.length];

  // ─── Date helpers ────────────────────────────────────────────────────────────
  const fmtDate = (d) => {
    if (!d) return '未定日期';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return d;
    return `${dt.getMonth()+1}/${dt.getDate()}(${'日一二三四五六'[dt.getDay()]})`;
  };
  const fmtShort = (d) => {
    if (!d) return '';
    const dt = new Date(d);
    return `${dt.getMonth()+1}/${dt.getDate()}`;
  };
  const tripDateRange = useMemo(() => getDatesInRange(tripStartDate, tripEndDate), [tripStartDate, tripEndDate]);
  const sortedDates   = useMemo(() => [...new Set(itinerary.map(i => i.date || '未定日期'))].sort(), [itinerary]);
  const currentDate   = sortedDates[selectedDay] || '';

  // ─── Finance computed ────────────────────────────────────────────────────────
  const financeSummary = useMemo(() => {
    const toBase = (amount, currency) => amount * (rates[currency] ?? 1);
    const userStats = Object.fromEntries(users.map(u => [u, { paid: 0, consumed: 0 }]));
    let total = 0;
    expenses.forEach(exp => {
      const base = toBase(exp.amount, exp.currency);
      total += base;
      if (userStats[exp.paidBy] !== undefined) userStats[exp.paidBy].paid += base;
      const split = exp.splitWith || users;
      const share = base / split.length;
      split.forEach(u => { if (userStats[u] !== undefined) userStats[u].consumed += share; });
    });
    return { total, userStats };
  }, [expenses, users, rates]);

  const settlement = useMemo(() => calcSettlement(financeSummary.userStats), [financeSummary]);

  // ─── Handlers ────────────────────────────────────────────────────────────────
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2000); };
  const toggleExpanded = (id) => setExpandedItems(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const toggleChecklist = (id) => setChecklist(list => list.map(i => i.id === id ? { ...i, checked: !i.checked } : i));
  const addChecklistItem = () => {
    if (!newChecklistItem.trim()) return;
    setChecklist(list => [...list, { id: crypto.randomUUID(), text: newChecklistItem.trim(), checked: false }]);
    setNewChecklistItem('');
  };
  const deleteChecklistItem = (id) => {
    if (!window.confirm('確定要刪除這個清單項目嗎？')) return;
    setChecklist(list => list.filter(i => i.id !== id));
  };
  const toggleShop = (iId, sId) => setItinerary(list => list.map(i => i.id === iId
    ? { ...i, shoppingList: (i.shoppingList || []).map(s => s.id === sId ? { ...s, checked: !s.checked } : s) }
    : i));

  // ─── CSV Export ─────────────────────────────────────────────────────────────
  const exportCSV = () => {
    const rows = [['日期','標題','類別','付款人','分攤','金額','幣別', baseCurrency+'換算']];
    expenses.forEach(exp => {
      const base = exp.amount * (rates[exp.currency] ?? 1);
      rows.push([exp.date||'', exp.title, exp.category, exp.paidBy, (exp.splitWith||users).join('/'), exp.amount, exp.currency, Math.round(base)]);
    });
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF'+csv], {type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=`${tripName}_費用.csv`; a.click();
    URL.revokeObjectURL(url);
    showToast('已匯出 CSV ✓');
  };

  // ─── Expense edit state ────────────────────────────────────────────────────
  const [editingExpId, setEditingExpId] = useState(null);
  const [editingExpData, setEditingExpData] = useState({});
  const startEditExp = (exp) => { setEditingExpId(exp.id); setEditingExpData({...exp}); };
  const saveEditExp = () => {
    setExpenses(list => list.map(e => e.id===editingExpId ? {...editingExpData} : e));
    setEditingExpId(null);
  };
  const deleteExp = (id) => { setExpenses(list => list.filter(e => e.id!==id)); setEditingExpId(null); };

  // ─── Checklist Sheet state ────────────────────────────────────────────────
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetInput, setSheetInput] = useState('');
  const sheetInputRef = React.useRef(null);
  const submitSheet = () => {
    if (!sheetInput.trim()) return;
    setChecklist(l => [...l, {id: crypto.randomUUID(), text: sheetInput.trim(), checked: false}]);
    setSheetInput('');
    setSheetOpen(false);
  };
  React.useEffect(() => { if (sheetOpen) setTimeout(() => sheetInputRef.current?.focus(), 80); }, [sheetOpen]);

  // ─── Expense Quick-add Sheet（從行程卡片觸發）────────────────────────────────
  const [expSheet, setExpSheet]         = useState(null); // {itineraryId, title}
  const [expSheetTitle, setExpSheetTitle] = useState('');
  const [expSheetAmt, setExpSheetAmt]   = useState('');
  const [expSheetCur, setExpSheetCur]   = useState(baseCurrency);
  const [expSheetCat, setExpSheetCat]   = useState('飲食');
  const [expSheetPaidBy, setExpSheetPaidBy] = useState('');
  const [expSheetSplit, setExpSheetSplit]   = useState([]);
  const expSheetAmtRef = React.useRef(null);

  const openExpSheet = (item) => {
    setExpSheet({itineraryId: item.id, sourceTitle: item.title});
    setExpSheetTitle('');
    setExpSheetAmt('');
    setExpSheetCur(baseCurrency);
    setExpSheetCat(item.type==='transport' ? '交通' : '飲食');
    setExpSheetPaidBy(users[0]||'');
    setExpSheetSplit([...users]);
  };
  React.useEffect(() => {
    if (expSheet) setTimeout(() => expSheetAmtRef.current?.focus(), 100);
  }, [expSheet]);

  const submitExpSheet = () => {
    if (!expSheetAmt || parseFloat(expSheetAmt)<=0) return;
    const splitWith = splitMode==='equal' ? [...users]
      : splitMode==='self' ? expSheetSplit
      : users; // custom 模式下 splitWith = 全部，金額另存
    const newExp = {
      id: crypto.randomUUID(),
      itineraryId: expSheet.itineraryId,
      title: expSheetTitle.trim() || expSheet.sourceTitle,
      amount: parseFloat(expSheetAmt),
      currency: expSheetCur,
      category: expSheetCat,
      paidBy: expSheetPaidBy,
      splitWith: splitWith.length>0 ? splitWith : [expSheetPaidBy],
      splitMode,
      customAmounts: splitMode==='custom' ? {...customAmounts} : undefined,
      date: currentDate || new Date().toISOString().split('T')[0],
    };
    setExpenses(list => [...list, newExp]);
    setExpSheet(null);
    setSplitMode('equal');
    setCustomAmounts({});
    showToast('已記帳 ✓');
  };

  const toggleSplitUser = (u) => setExpSheetSplit(prev =>
    prev.includes(u) ? prev.filter(x=>x!==u) : [...prev, u]
  );

  // 分攤模式：'equal'=平分 | 'custom'=自訂 | 'self'=各付各的
  const [splitMode, setSplitMode] = useState('equal');
  const [customAmounts, setCustomAmounts] = useState({});
  const openExpSheetWithMode = (item) => {
    openExpSheet(item);
    setSplitMode('equal');
    setCustomAmounts({});
  };

  // 左滑刪除：統一 swipe state（key=id, val=type）
  const [swipeMap, setSwipeMap] = useState({});
  const openSwipe = (id) => setSwipeMap(prev => ({...prev, [id]: true}));
  const closeSwipe = (id) => setSwipeMap(prev => { const n={...prev}; delete n[id]; return n; });
  const closeAllSwipe = () => setSwipeMap({});

  // 清單項目編輯
  const [editingCheckId, setEditingCheckId] = useState(null);
  const [editingCheckText, setEditingCheckText] = useState('');
  const startEditCheck = (item) => { setEditingCheckId(item.id); setEditingCheckText(item.text); };
  const saveEditCheck = () => {
    if (editingCheckText.trim()) {
      setChecklist(list => list.map(i => i.id===editingCheckId ? {...i, text:editingCheckText.trim()} : i));
    }
    setEditingCheckId(null);
  };

  // ─── Detail sheet handlers ──────────────────────────────────────────────────
  const openDetailSheet = (item) => {
    setDetailSheet(item);
    setDetailEditing(true);   // 點 ... 直接進入編輯
    setDetailData({...item});
    setSwipedId(null);
    setEditExpandedId(null);
  };
  const saveDetailSheet = () => {
    setItinerary(list => list.map(i => i.id === detailSheet.id ? {...detailData} : i));
    setDetailSheet(null);
    showToast('已儲存 ✓');
  };
  const deleteFromDetail = () => {
    if (!window.confirm('確定要刪除這個行程嗎？')) return;
    setItinerary(list => list.filter(i => i.id !== detailSheet.id));
    setDetailSheet(null);
    showToast('已刪除');
  };

  // ─── Move item logic ───────────────────────────────────────────────────────
  const handleMoveTarget = (targetId, targetDate) => {
    if (!movingItemId || movingItemId === targetId) { setMovingItemId(null); return; }
    setItinerary(prev => {
      const arr = [...prev];
      const fromIdx = arr.findIndex(i => i.id === movingItemId);
      if (fromIdx === -1) return prev;
      // 更新日期為目標日期，插入到目標前面
      const moved = { ...arr[fromIdx], date: targetDate };
      arr.splice(fromIdx, 1);
      const toIdx = arr.findIndex(i => i.id === targetId);
      arr.splice(toIdx === -1 ? arr.length : toIdx, 0, moved);
      return arr;
    });
    setMovingItemId(null);
    showToast('已移動 ✓');
  };
  const handleMoveToDay = (targetDate) => {
    // 移動到某天的最後
    if (!movingItemId) return;
    setItinerary(prev => {
      const arr = [...prev];
      const fromIdx = arr.findIndex(i => i.id === movingItemId);
      if (fromIdx === -1) return prev;
      const moved = { ...arr[fromIdx], date: targetDate };
      arr.splice(fromIdx, 1);
      // 找該天最後一個的後面插入
      const lastOfDay = arr.reduce((acc, item, idx) => item.date === targetDate ? idx : acc, -1);
      arr.splice(lastOfDay + 1, 0, moved);
      return arr;
    });
    setMovingItemId(null);
    showToast('已移動 ✓');
  };
  const scrollToDay = (date) => {
    const el = dayRefs.current[date];
    const container = itineraryScrollRef.current;
    if (el && container) {
      const offset = el.offsetTop - 8;
      container.scrollTo({ top: offset, behavior: 'smooth' });
    }
  };

  // ─── Online state ─────────────────────────────────────────────────────────
  const [isOnline, setIsOnline] = React.useState(navigator.onLine);
  React.useEffect(() => {
    const on = () => setIsOnline(true), off = () => setIsOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // ─── RENDER helpers ────────────────────────────────────────────────────────
  const todayStr = new Date().toISOString().split('T')[0];
  const dayLabel = (d) => {
    if (!d) return '';
    const dt = new Date(d);
    return `${dt.getMonth()+1}月${dt.getDate()}日（${'日一二三四五六'[dt.getDay()]}）`;
  };
  const isToday = (d) => d === todayStr;
  const todayAccom = accommodations.find(a => a.date === currentDate);
  const todayShopItems = itinerary.filter(i => i.date===currentDate && i.shoppingList?.length>0);

  // checklist 統計
  const checkDone = checklist.filter(i=>i.checked).length;
  const checkTotal = checklist.length;
  const checkPct = checkTotal>0 ? Math.round(checkDone/checkTotal*100) : 0;

  return (
    <div className="relative min-h-screen max-w-md mx-auto flex flex-col"
      style={{background:'#FFFFFF', fontFamily:"'DM Sans','Noto Sans TC',sans-serif", height:'100dvh', overflow:'hidden'}}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;900&display=swap');
        * { -webkit-font-smoothing: antialiased; box-sizing: border-box; }
        input:focus { outline: none; }
        ::-webkit-scrollbar { display: none; }
        .fab { transition: transform 0.15s ease, box-shadow 0.15s ease; }
        .fab:active { transform: scale(0.93); }
        .scroll-area { overflow-y: auto; -webkit-overflow-scrolling: touch; }
      `}</style>

      {/* Toast */}
      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] text-white text-sm font-bold px-5 py-3 rounded-2xl shadow-xl"
          style={{background:C.ink, zIndex:200}}>
          {toast}
        </div>
      )}

      {/* 移動中提示 banner */}
      {movingItemId && (
        <div className="fixed top-0 inset-x-0 z-[90] flex items-center justify-between px-4 py-3"
          style={{background:C.warning, maxWidth:'448px', left:'50%', transform:'translateX(-50%)'}}>
          <p className="text-sm font-black text-white">
            選擇要插入的位置或目標天
          </p>
          <button onClick={()=>setMovingItemId(null)}
            className="text-white opacity-80 active:opacity-60">
            <X size={18}/>
          </button>
        </div>
      )}

      {/* ══ HEADER（固定，不捲動）══ */}
      <header className="shrink-0 border-b z-30" style={{background:C.card, borderColor:C.border}}>
        <div className="flex items-center gap-3 px-4 pt-11 pb-2">
          {onBack && (
            <button onClick={onBack} className="p-1 -ml-1 active:opacity-60" style={{color:C.ink}}>
              <ArrowLeft size={22} strokeWidth={2}/>
            </button>
          )}
          <button onClick={() => !readOnly && setTripIconIndex(i => (i+1)%TRIP_ICONS.length)}
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{background:C.primaryLight, color:C.primary}}>
            <TripIcon size={18} strokeWidth={2.5}/>
          </button>
          {!readOnly && isEditingName
            ? <input type="text" value={tripName} maxLength={15} autoFocus
                onChange={e=>setTripName(e.target.value)}
                onBlur={()=>setIsEditingName(false)}
                onKeyDown={e=>e.key==='Enter'&&setIsEditingName(false)}
                className="flex-1 text-xl font-black border-b-2 bg-transparent"
                style={{color:C.ink, borderColor:C.primary}}/>
            : <h1 onClick={()=>!readOnly&&setIsEditingName(true)}
                className={`flex-1 font-black truncate ${tripName.length>10?'text-lg':'text-xl'} ${!readOnly?'cursor-text':''}`}
                style={{color:C.ink, letterSpacing:'-0.03em'}}>
                {tripName}
              </h1>
          }
          {/* 同步狀態 dot */}
          <div className="w-2.5 h-2.5 rounded-full shrink-0 transition-colors duration-500"
            style={{background: isOnline ? '#4ade80' : C.warning}}
            title={isOnline?'已連線':'離線中'}/>
          {!readOnly && (
            <>
              {/* 行程 mode 才顯示編輯按鈕 */}
              {mode==='itinerary' && (
                <button
                  onClick={()=>{ setIsEditMode(v=>!v); setMovingItemId(null); setFabOpen(false); setSwipedId(null); }}
                  className="px-3 py-1.5 rounded-xl text-xs font-black transition-all"
                  style={isEditMode
                    ? {background:C.primary, color:'#fff'}
                    : {background:C.primaryLight, color:C.primary}}>
                  {isEditMode ? '完成' : '編輯'}
                </button>
              )}
              <button onClick={()=>showToast('分享功能待接入')} className="p-2 rounded-full active:opacity-60" style={{color:C.muted}}>
                <Share2 size={19}/>
              </button>
              <button onClick={()=>showToast('設定功能待接入')} className="p-2 rounded-full active:opacity-60" style={{color:C.muted}}>
                <Settings size={19}/>
              </button>
            </>
          )}
        </div>
        {/* Date row */}
        <div className="px-4 pb-3">
          {isEditingDates && !readOnly
            ? <div className="flex items-center gap-2">
                <input type="date" value={tripStartDate} onChange={e=>setTripStartDate(e.target.value)}
                  className="flex-1 text-xs border rounded-lg px-2 py-1.5" style={{borderColor:C.border, color:C.body}}/>
                <ArrowRight size={12} style={{color:C.muted}}/>
                <input type="date" value={tripEndDate} min={tripStartDate} onChange={e=>setTripEndDate(e.target.value)}
                  className="flex-1 text-xs border rounded-lg px-2 py-1.5" style={{borderColor:C.border, color:C.body}}/>
                <button onClick={()=>setIsEditingDates(false)} style={{color:C.primary}}><Check size={16}/></button>
              </div>
            : <button onClick={()=>!readOnly&&setIsEditingDates(true)}
                className="flex items-center gap-1.5 text-xs font-medium active:opacity-60" style={{color:C.muted}}>
                <Calendar size={12}/>
                {tripStartDate&&tripEndDate
                  ? `${fmtShort(tripStartDate)} – ${fmtShort(tripEndDate)} · ${users.length} 人同行`
                  : !readOnly?'＋ 設定旅行日期':'未設定日期'}
              </button>
          }
        </div>
      </header>

      {/* ══ BODY（flex-1，各 mode 自己管捲動）══ */}
      <div className="flex-1 flex flex-col min-h-0">

        {/* ━━ 清單 mode ━━ */}
        {mode==='checklist' && (
          <div className="flex flex-col min-h-0 flex-1">

            {/* ── Tab bar：固定 ── */}
            <div className="shrink-0 border-b" style={{background:C.card, borderColor:C.border}}>
              {/* Google Tasks 風格 tab：橫向 scroll，底線 indicator */}
              <div className="flex overflow-x-auto" style={{gap:0}}>
                {[['pretrip','行前清單'],['shopping','購物總覽'],['spots','收藏景點']].map(([id,label])=>(
                  <button key={id} onClick={()=>setListTab(id)}
                    className="flex-shrink-0 px-5 py-3 text-sm font-bold relative transition-colors"
                    style={{
                      color: listTab===id ? C.primary : C.muted,
                      borderBottom: listTab===id ? `2.5px solid ${C.primary}` : '2.5px solid transparent',
                      background: 'transparent',
                    }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* ── 進度條：固定在 tab 下方，精簡 ── */}
            {listTab==='pretrip' && checkTotal>0 && (
              <div className="shrink-0 px-4 py-2 flex items-center gap-3 border-b" style={{borderColor:C.border, background:C.card}}>
                <div className="flex-1 h-2 rounded-full overflow-hidden" style={{background:'#EEF2F6'}}>
                  <div className="h-full rounded-full transition-all duration-500"
                    style={{width:`${checkPct}%`, background: checkPct===100 ? '#4ade80' : C.primary}}/>
                </div>
                <span className="text-xs font-black shrink-0"
                  style={{color: checkPct===100 ? '#4ade80' : C.primary, minWidth:'42px', textAlign:'right'}}>
                  {checkDone}/{checkTotal}
                </span>
              </div>
            )}

            {/* ── 可捲動清單區 ── */}
            <div className="scroll-area flex-1 pb-28">

              {/* 行前清單 */}
              {listTab==='pretrip' && (
                <div>
                  {/* 未完成 */}
                  {checklist.filter(i=>!i.checked).map((item,idx,arr)=>(
                    <div key={item.id} style={{borderBottom:`1px solid ${C.border}`, overflow:'hidden', position:'relative'}}>
                      {/* 左滑刪除底層 */}
                      <div className="absolute inset-y-0 right-0 flex items-center px-4"
                        style={{background:C.danger, width:'80px', justifyContent:'center'}}>
                        <Trash2 size={18} color="#fff"/>
                      </div>
                      {/* 主列（可左滑） */}
                      <div className="flex items-center gap-3 px-4 py-3.5 bg-white"
                        style={{
                          transform: swipeMap[item.id] ? 'translateX(-80px)' : 'translateX(0)',
                          transition: 'transform 0.2s ease',
                          position:'relative', zIndex:1,
                        }}
                        onPointerDown={e => { e._sx = e.clientX; }}
                        onPointerUp={e => {
                          const dx = e.clientX - (e._sx||e.clientX);
                          if (dx < -40) openSwipe(item.id);
                          else if (dx > 10) closeSwipe(item.id);
                        }}>
                        <button onClick={()=>{ closeAllSwipe(); toggleChecklist(item.id); }}
                          className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 active:scale-90 transition-transform"
                          style={{borderColor:C.muted, background:'transparent'}}/>
                        {editingCheckId===item.id ? (
                          <input autoFocus value={editingCheckText}
                            onChange={e=>setEditingCheckText(e.target.value)}
                            onBlur={saveEditCheck}
                            onKeyDown={e=>e.key==='Enter'&&saveEditCheck()}
                            className="flex-1 text-sm font-medium border-b bg-transparent"
                            style={{color:C.ink, borderColor:C.primary}}/>
                        ) : (
                          <span className="flex-1 text-sm font-medium" style={{color:C.ink}}
                            onClick={()=>closeAllSwipe()}>
                            {item.text}
                          </span>
                        )}
                        {!readOnly && (
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button onClick={()=>{ closeAllSwipe(); startEditCheck(item); }}
                              className="p-1.5" style={{color:C.muted}}>
                              <Edit2 size={13}/>
                            </button>
                            <button onClick={()=>{ closeSwipe(item.id); deleteChecklistItem(item.id); }}
                              className="p-1.5" style={{color:swipeMap[item.id]?C.danger:C.border}}>
                              <Trash2 size={13}/>
                            </button>
                          </div>
                        )}
                      </div>
                      {/* 滑開後點刪除觸發 */}
                      {swipeMap[item.id] && (
                        <button className="absolute inset-y-0 right-0 flex items-center justify-center"
                          style={{width:'80px', zIndex:2}}
                          onClick={()=>{ closeSwipe(item.id); deleteChecklistItem(item.id); }}/>
                      )}
                    </div>
                  ))}

                  {/* 已完成摺疊 */}
                  {checkDone>0 && (
                    <>
                      <button onClick={()=>setShowDoneRegular(v=>!v)}
                        className="flex items-center gap-2 px-4 py-3.5 w-full text-sm font-bold"
                        style={{color:C.muted, borderBottom:`1px solid ${C.border}`}}>
                        <ChevronDown size={15} className={`transition-transform ${showDoneRegular?'rotate-180':''}`}/>
                        已完成 ({checkDone})
                      </button>
                      {showDoneRegular && checklist.filter(i=>i.checked).map(item=>(
                        <div key={item.id} className="flex items-center gap-3 px-4 py-3.5"
                          style={{borderBottom:`1px solid ${C.border}`, opacity:0.5}}>
                          <button onClick={()=>toggleChecklist(item.id)}
                            className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                            style={{background:C.primary}}>
                            <Check size={11} color="#fff"/>
                          </button>
                          <span className="flex-1 text-sm line-through" style={{color:C.muted}}>{item.text}</span>
                          {!readOnly && (
                            <div className="flex items-center gap-0.5 shrink-0">
                              <button onClick={()=>startEditCheck(item)} className="p-1.5" style={{color:C.muted}}>
                                <Edit2 size={13}/>
                              </button>
                              <button onClick={()=>deleteChecklistItem(item.id)} className="p-1.5" style={{color:C.border}}>
                                <Trash2 size={13}/>
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </>
                  )}

                  {checkTotal===0 && (
                    <div className="py-16 text-center text-sm" style={{color:C.muted}}>尚無清單項目，點右下＋新增</div>
                  )}
                </div>
              )}

              {/* 購物總覽 */}
              {listTab==='shopping' && (
                <div className="px-4 py-4 space-y-4">
                  {(() => {
                    const shopItems = itinerary.filter(i=>i.shoppingList?.length>0);
                    if (!shopItems.length) return <div className="text-center py-16 flex flex-col items-center gap-3" style={{color:C.muted}}><ShoppingBag size={44} opacity={0.2}/><p className="text-sm font-medium">目前沒有任何購物清單</p></div>;
                    return shopItems.map(item=>(
                      <div key={item.id} className="rounded-2xl border overflow-hidden" style={{background:C.card, borderColor:C.border, boxShadow:C.cardShadow}}>
                        <div className="flex items-center gap-1.5 px-4 py-3 border-b text-sm font-bold" style={{borderColor:C.border, color:C.ink}}>
                          <MapPin size={13} style={{color:C.primary}}/>{item.title}
                          <span className="ml-1 text-xs font-medium" style={{color:C.muted}}>({fmtDate(item.date)})</span>
                        </div>
                        <div className="px-4 py-3 space-y-3">
                          {item.shoppingList.map(s=>(
                            <div key={s.id} className="flex items-center gap-3">
                              <button onClick={()=>toggleShop(item.id,s.id)}
                                className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all"
                                style={s.checked?{background:C.primary,borderColor:C.primary}:{borderColor:C.muted}}>
                                {s.checked && <Check size={11} color="#fff"/>}
                              </button>
                              <span className="flex-1 text-sm font-medium" style={{color:s.checked?C.muted:C.ink, textDecoration:s.checked?'line-through':'none'}}>{s.text}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              )}

              {/* 收藏景點 */}
              {listTab==='spots' && (
                <div className="py-16 flex flex-col items-center gap-3" style={{color:C.muted}}>
                  <Star size={44} opacity={0.2}/>
                  <p className="text-sm font-medium">尚無收藏景點</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ━━ 行程 mode ━━ */}
        {mode==='itinerary' && (
          <div className="flex flex-col min-h-0 flex-1">

            {/* Day selector：固定 */}
            {sortedDates.length>0 && (
              <div className="shrink-0 border-b" style={{background:C.card, borderColor:C.border}}>
                <div className="flex gap-2 overflow-x-auto px-4 py-3">
                  {/* 今天捷徑 */}
                  {sortedDates.some(d=>isToday(d)) && (
                    <button
                      onClick={()=>setSelectedDay(sortedDates.findIndex(d=>isToday(d)))}
                      className="flex-shrink-0 flex flex-col items-center rounded-2xl transition-all"
                      style={{
                        background: C.warningLight,
                        color: C.warning,
                        border: `1.5px solid ${C.warning}55`,
                        padding: '7px 11px',
                      }}>
                      <span className="text-[10px] font-black">今天</span>
                      <span className="text-xs font-black">▶</span>
                    </button>
                  )}
                  {sortedDates.map((date,idx)=>{
                    const today = isToday(date);
                    const active = selectedDay===idx;
                    const dayNum = idx+1;
                    const dt = new Date(date);
                    const mmdd = `${dt.getMonth()+1}/${dt.getDate()}`;
                    // 編輯模式：點日期 → 捲動到該 section；瀏覽模式：切換顯示天
                    const handleDayClick = () => {
                      if (isEditMode) { scrollToDay(date); setSelectedDay(idx); }
                      else { setSelectedDay(idx); }
                    };
                    // 移動中：點日期 = 移到該天最後
                    const handleDayClickMoving = () => { handleMoveToDay(date); };
                    return (
                      <button key={date}
                        onClick={movingItemId ? handleDayClickMoving : handleDayClick}
                        className="flex-shrink-0 flex flex-col items-center rounded-2xl transition-all"
                        style={movingItemId
                          ? {background:C.warningLight, color:C.warning, border:`1.5px dashed ${C.warning}`, padding:'7px 13px'}
                          : active
                            ? {background:C.primary,color:'#fff',padding:'7px 13px'}
                            : {background:'#F4F7FA',color:C.body,border:`1px solid ${C.border}`,padding:'7px 13px'}}>
                        <span className="text-[11px] font-black">Day {dayNum}</span>
                        <span className="text-xs font-medium opacity-80">{mmdd}</span>
                        {today && !movingItemId && (
                          <span className="text-[9px] font-black mt-0.5"
                            style={{color:active?'rgba(255,255,255,0.85)':C.warning}}>今天</span>
                        )}
                        {movingItemId && (
                          <span className="text-[9px] font-black mt-0.5" style={{color:C.warning}}>移到這天</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 可捲動行程區 */}
            <div ref={itineraryScrollRef} className="scroll-area flex-1 pb-28">

              {/* 無任何日期：放在 map 外面 */}
              {sortedDates.length === 0 && (
                <div className="text-center py-20 flex flex-col items-center gap-4" style={{color:C.muted}}>
                  <Plane size={52} opacity={0.15}/>
                  <p className="font-black text-base" style={{color:C.ink, letterSpacing:'-0.02em'}}>尚未新增任何行程</p>
                  <p className="text-sm mt-1">先設定旅行日期，開始規劃吧</p>
                </div>
              )}

              {/* 各天 section */}
              {(isEditMode ? sortedDates : (currentDate ? [currentDate] : [])).map((dateKey, dateKeyIdx) => {
                const accom      = accommodations.find(a => a.date === dateKey);
                const shopItems  = itinerary.filter(i => i.date === dateKey && i.shoppingList?.length > 0);
                const isLastDay  = dateKeyIdx === sortedDates.length - 1;
                const dayItems   = itinerary.filter(i => i.date === dateKey);

                return (
                  <div key={dateKey} ref={el => { dayRefs.current[dateKey] = el; }} className="px-4 pt-4 pb-2">

                    {/* ── 當日 header ── */}
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <p className="text-lg font-black" style={{color:C.ink, letterSpacing:'-0.02em'}}>{dayLabel(dateKey)}</p>
                        {isToday(dateKey) && (
                          <span className="inline-block text-[11px] font-black px-2 py-0.5 rounded-full mt-0.5"
                            style={{background:C.warningLight, color:C.warning}}>今天</span>
                        )}
                      </div>
                      {accom && (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl border ml-2"
                          style={{background:C.primaryLight, borderColor:C.primary+'33', maxWidth:'52%', flexShrink:0}}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                            <polyline points="9 22 9 12 15 12 15 22"/>
                          </svg>
                          <div className="min-w-0">
                            <p className="text-[10px] font-bold" style={{color:C.primary, opacity:0.7}}>今晚住宿</p>
                            <p className="text-xs font-black truncate" style={{color:C.primary}}>{accom.name}</p>
                          </div>
                          <button onClick={()=>showToast('導航待接入')} style={{color:C.primary, opacity:0.6}}>
                            <Navigation size={12}/>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* ── 行程卡片列表 ── */}
                    {dayItems.map(item => {
                      const isTransport = item.type === 'transport';
                      return (
                        <div key={item.id} className="mb-3">

                          {isTransport ? (

                            /* ══ 交通卡片 ══ */
                            <div className="rounded-2xl border overflow-hidden"
                              style={{
                                background: '#F8FAFD',
                                borderColor: (isEditMode && editExpandedId===item.id) ? C.primary : C.primary+'44',
                                boxShadow: C.cardShadow,
                                transition: 'border-color 0.15s',
                              }}>

                              {/* 主列：flex items-center 整體垂直置中 */}
                              <div className="flex items-center gap-3 px-4 py-3">

                                {/* 左欄：時間 + icon（恆常顯示），編輯模式額外加移動 handle */}
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {isEditMode && (
                                    <button
                                      onClick={() => {
                                        if (movingItemId === item.id) setMovingItemId(null);
                                        else if (movingItemId) handleMoveTarget(item.id, dateKey);
                                        else setMovingItemId(item.id);
                                      }}
                                      className="p-1 rounded-lg shrink-0"
                                      style={{
                                        color: movingItemId===item.id ? C.warning : movingItemId ? C.primary : C.muted,
                                        background: movingItemId===item.id ? C.warningLight : 'transparent',
                                      }}>
                                      {movingItemId===item.id
                                        ? <X size={14}/>
                                        : movingItemId
                                          ? <ArrowRight size={14}/>
                                          : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                              <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
                                              <line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/>
                                              <line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
                                            </svg>
                                      }
                                    </button>
                                  )}
                                  {/* 時間 + emoji icon：直排置中 */}
                                  <div className="flex flex-col items-center" style={{width:'36px'}}>
                                    <span className="text-[11px] font-black text-center leading-none mb-1.5"
                                      style={{color:C.primary}}>{item.time}</span>
                                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0"
                                      style={{background:C.primaryLight}}>
                                      {getTransportEmoji(item.transportMode)}
                                    </div>
                                  </div>
                                </div>

                                {/* 中間：交通方式 + 起訖 + 時長 */}
                                <div className="flex-1 min-w-0">
                                  <p className="text-[15px] font-black leading-snug"
                                    style={{color:C.ink, letterSpacing:'-0.02em'}}>
                                    {item.transportMode || item.title || '交通'}
                                  </p>
                                  {(item.from || item.to) && (
                                    <a
                                      href={`https://www.google.com/maps/dir/${encodeURIComponent(item.from||'')}/${encodeURIComponent(item.to||'')}`}
                                      target="_blank" rel="noreferrer"
                                      className="flex items-center gap-1 text-xs font-medium mt-1 hover:underline"
                                      style={{color:C.primary}}>
                                      <Navigation size={10}/>
                                      {item.from||'—'} → {item.to||'—'}
                                    </a>
                                  )}
                                  {item.duration && (
                                    <p className="text-xs mt-0.5" style={{color:C.muted}}>{item.duration}</p>
                                  )}
                                </div>

                                {/* 右側：編輯 → ... */}
                                {isEditMode && (
                                  <button
                                    onClick={() => openDetailSheet(item)}
                                    className="shrink-0 p-1"
                                    style={{color:C.muted}}>
                                    <MoreHorizontal size={18}/>
                                  </button>
                                )}

                              </div>

                              {/* 記一筆：直接顯示在卡片底部（瀏覽模式）*/}
                              {!isEditMode && !readOnly && (
                                <div className="flex" style={{borderTop:`1px solid ${C.primary}22`}}>
                                  <button onClick={()=>openExpSheetWithMode(item)}
                                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold"
                                    style={{color:C.primary}}>
                                    <DollarSign size={13}/>記一筆
                                  </button>
                                </div>
                              )}

                            </div>

                          ) : (

                            /* ══ 景點卡片 ══ */
                            <div className="rounded-2xl border overflow-hidden"
                              style={{
                                background: movingItemId===item.id ? C.primaryLight : C.card,
                                borderColor: (isEditMode && editExpandedId===item.id) ? C.primary : movingItemId ? C.primary+'44' : C.border,
                                boxShadow: C.cardShadow,
                                transition: 'border-color 0.15s, background 0.15s',
                              }}>

                              {/* 卡片主體 */}
                              <div className="px-4 pt-3 pb-3">
                                <div className="flex items-center gap-3">

                                  {/* 左欄：時間 + icon（恆常顯示），編輯模式額外加移動 handle */}
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {isEditMode && (
                                      <button
                                        onClick={() => {
                                          if (movingItemId === item.id) setMovingItemId(null);
                                          else if (movingItemId) handleMoveTarget(item.id, dateKey);
                                          else setMovingItemId(item.id);
                                        }}
                                        className="p-1 rounded-lg shrink-0"
                                        style={{
                                          color: movingItemId===item.id ? C.warning : movingItemId ? C.primary : C.muted,
                                          background: movingItemId===item.id ? C.warningLight : 'transparent',
                                        }}>
                                        {movingItemId===item.id
                                          ? <X size={14}/>
                                          : movingItemId
                                            ? <ArrowRight size={14}/>
                                            : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
                                                <line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/>
                                                <line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
                                              </svg>
                                        }
                                      </button>
                                    )}
                                    {/* 時間 + icon：直排，置中對齊 */}
                                    <div className="flex flex-col items-center" style={{width:'36px'}}>
                                      <span className="text-[11px] font-black text-center leading-none mb-1.5"
                                        style={{color:C.primary}}>{item.time}</span>
                                      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                                        style={{background:C.primaryLight}}>
                                        <MapPin size={16} style={{color:C.primary}}/>
                                      </div>
                                    </div>
                                  </div>

                                  {/* 中間：標題 + 地點 + 備注 */}
                                  <div className="flex-1 min-w-0">
                                    <h3 className="text-[15px] font-black leading-snug"
                                      style={{color:C.ink, letterSpacing:'-0.02em'}}>{item.title}</h3>
                                    {item.location && (
                                      <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.location)}`}
                                        target="_blank" rel="noreferrer"
                                        className="flex items-center gap-1 text-xs font-medium mt-1 hover:underline"
                                        style={{color:C.primary}}>
                                        <MapPin size={10}/>{item.location}
                                      </a>
                                    )}
                                    {item.notes && (
                                      <p className="text-xs mt-1 leading-relaxed" style={{color:C.body}}>{item.notes}</p>
                                    )}
                                  </div>

                                  {/* 右側：... 或 展開箭頭 */}
                                  {isEditMode ? (
                                    <button
                                      onClick={() => openDetailSheet(item)}
                                      className="shrink-0 p-1"
                                      style={{color:C.muted}}>
                                      <MoreHorizontal size={18}/>
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => toggleExpanded(item.id)}
                                      className="shrink-0 p-1"
                                      style={{color:C.muted}}>
                                      {expandedItems.has(item.id) ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
                                    </button>
                                  )}

                                </div>

                                {/* 瀏覽模式展開詳情 */}
                                {!isEditMode && expandedItems.has(item.id) && (
                                  <div className="mt-3 pt-3 space-y-2" style={{borderTop:`1px solid ${C.border}`}}>
                                    {item.hours   && <p className="text-xs flex items-center gap-1.5" style={{color:C.muted}}><Clock  size={12}/>營業時間：{item.hours}</p>}
                                    {item.tickets && <p className="text-xs flex items-center gap-1.5" style={{color:C.muted}}><Ticket size={12}/>門票：{item.tickets}</p>}
                                    {item.website && (
                                      <a href={item.website} target="_blank" rel="noreferrer"
                                        className="text-xs flex items-center gap-1.5 hover:underline" style={{color:C.primary}}>
                                        <Globe size={12}/>官方網站
                                      </a>
                                    )}
                                  </div>
                                )}

                              </div>

                              {/* 動作列（瀏覽模式） */}
                              {!isEditMode && (
                                <div className="flex" style={{borderTop:`1px solid ${C.border}`}}>
                                  {!readOnly && (
                                    <button onClick={()=>openExpSheetWithMode(item)}
                                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold active:opacity-70"
                                      style={{color:C.primary}}>
                                      <DollarSign size={14}/>記一筆
                                    </button>
                                  )}
                                  {item.location && (
                                    <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(item.location)}`}
                                      target="_blank" rel="noreferrer"
                                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold"
                                      style={{color:C.primary, borderLeft:!readOnly?`1px solid ${C.border}`:'none'}}>
                                      <Navigation size={14}/>路線
                                    </a>
                                  )}
                                </div>
                              )}

                            </div>

                          )}{/* end isTransport ? */}

                          {/* 左滑刪除 backdrop（只在編輯模式 + 非交通） */}
                          {isEditMode && !isTransport && swipeMap[item.id] && (
                            <div className="flex items-center justify-end px-4 -mt-3 mb-3">
                              <button
                                onClick={() => {
                                  if (!window.confirm('確定要刪除這個行程嗎？')) return;
                                  setItinerary(list => list.filter(i => i.id !== item.id));
                                  setSwipedId(null);
                                  showToast('已刪除');
                                }}
                                className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-sm font-black text-white"
                                style={{background: C.danger, boxShadow:`0 4px 16px ${C.danger}55`}}>
                                <Trash2 size={15}/>刪除
                              </button>
                              <button
                                onClick={() => closeSwipe(item.id)}
                                className="ml-2 px-3 py-2.5 rounded-2xl text-sm font-bold"
                                style={{background:'#F4F7FA', color:C.muted}}>
                                取消
                              </button>
                            </div>
                          )}

                        </div>
                      ); // end item return
                    })}{/* end dayItems.map */}

                    {/* ── 空白日提示 ── */}
                    {dayItems.length === 0 && (
                      <div className="flex flex-col items-center gap-4 py-14">
                        <Map size={40} style={{color:C.border}}/>
                        <div className="text-center">
                          <p className="text-sm font-black" style={{color:C.ink}}>這天還沒有行程</p>
                          <p className="text-xs mt-1" style={{color:C.muted}}>直接新增，或點右下 ＋</p>
                        </div>
                        <div className="flex gap-3">
                          <button onClick={()=>showToast('新增景點 – 待接入')}
                            className="fab flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-black"
                            style={{background:C.primaryLight, color:C.primary, boxShadow:C.cardShadow}}>
                            <MapPin size={16}/>新增景點
                          </button>
                          <button onClick={()=>showToast('新增交通 – 待接入')}
                            className="fab flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-black"
                            style={{background:'#F4F7FA', color:C.body, boxShadow:C.cardShadow, border:`1px solid ${C.border}`}}>
                            <Car size={16}/>新增交通
                          </button>
                        </div>
                      </div>
                    )}

                    {/* ── 當天購物清單 ── */}
                    {shopItems.length > 0 && (
                      <div className="mt-5">
                        <div className="flex items-center gap-2 mb-2 px-1">
                          <ShoppingBag size={13} style={{color:C.muted}}/>
                          <span className="text-[11px] font-black uppercase tracking-widest" style={{color:C.muted}}>今日購物清單</span>
                        </div>
                        <div className="rounded-2xl border overflow-hidden"
                          style={{background:C.card, borderColor:C.border, boxShadow:C.cardShadow}}>
                          {shopItems.map((shopItem, gi, ga) => (
                            <div key={shopItem.id}>
                              <p className="px-4 pt-3 pb-1 text-xs font-black" style={{color:C.muted}}>{shopItem.title}</p>
                              {shopItem.shoppingList.map((s, si, sa) => (
                                <div key={s.id} className="flex items-center gap-3 px-4 py-2.5"
                                  style={{borderBottom:(gi<ga.length-1||si<sa.length-1)?`1px solid ${C.border}`:'none'}}>
                                  <div className="w-2 h-2 rounded-full shrink-0"
                                    style={{background:s.checked?C.primary:'#D1D9E0'}}/>
                                  <span className="flex-1 text-sm font-medium"
                                    style={{color:s.checked?C.muted:C.ink, textDecoration:s.checked?'line-through':'none'}}>
                                    {s.text}
                                  </span>
                                </div>
                              ))}{/* end shoppingList.map */}
                            </div>
                          ))}{/* end shopItems.map */}
                        </div>
                      </div>
                    )}

                    {/* ── 天間分隔線（編輯模式） ── */}
                    {isEditMode && !isLastDay && (
                      <div className="mt-4 mb-0 h-px" style={{background:C.border}}/>
                    )}

                  </div>
                ); // end dateKey return
              })}
              {/* end sortedDates.map */}

            </div>
            {/* end scroll-area */}
          </div>
        )}

        {/* ━━ 記帳 mode ━━ */}
        {mode==='finance' && (
          <div className="flex flex-col min-h-0 flex-1">

            {/* Summary hero：固定 */}
            <div className="shrink-0 mx-4 mt-4 mb-3 rounded-3xl p-4 text-white"
              style={{background:C.primary, boxShadow:'0 8px 32px rgba(72,116,158,0.25)'}}>
              <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{color:'rgba(255,255,255,0.55)'}}>
                總花費
              </p>
              <p className="text-4xl font-black mb-4 tracking-tighter">
                {baseCurrency} {Math.round(financeSummary.total).toLocaleString()}
              </p>
              {/* 每人花費：只顯示名字 + 消費金額 + 幣別 */}
              <div className="grid grid-cols-2 gap-2">
                {users.map(u => {
                  const s = financeSummary.userStats[u];
                  if (!s) return null;
                  return (
                    <div key={u} className="rounded-2xl p-3" style={{background:'rgba(255,255,255,0.12)'}}>
                      <p className="text-xs font-medium truncate mb-1" style={{color:'rgba(255,255,255,0.55)'}}>{u}</p>
                      <p className="text-base font-black text-white leading-tight">
                        {baseCurrency} {Math.round(s.consumed).toLocaleString()}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 可捲動費用區 */}
            <div className="scroll-area flex-1 pb-28 px-4 space-y-4">

              {/* 建議結算：口語化，只列需要付款的人 */}
              {settlement.length > 0 && (
                <div className="rounded-2xl border overflow-hidden" style={{background:C.card, borderColor:C.border, boxShadow:C.cardShadow}}>
                  <div className="px-4 py-3 border-b" style={{borderColor:C.border}}>
                    <p className="text-[11px] font-black uppercase tracking-widest" style={{color:C.muted}}>費用結算</p>
                  </div>
                  <div className="px-4 py-3 space-y-2.5">
                    {settlement.map((t, i) => (
                      <div key={i} className="rounded-2xl px-4 py-3" style={{background:'#F4F8FC'}}>
                        {/* 句子：「小明 需要付給 小花」 */}
                        <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                          <span className="text-sm font-black" style={{color:C.ink}}>{t.from}</span>
                          <span className="text-xs font-medium" style={{color:C.muted}}>需要付給</span>
                          <span className="text-sm font-black" style={{color:C.primary}}>{t.to}</span>
                        </div>
                        {/* 金額 */}
                        <p className="text-xl font-black tracking-tight" style={{color:C.ink}}>
                          {baseCurrency} {t.amount.toLocaleString()}
                        </p>
                      </div>
                    ))}
                    {/* 已結清的人不列出 */}
                    {users.filter(u => {
                      const s = financeSummary.userStats[u];
                      return s && Math.abs(s.paid - s.consumed) < 1;
                    }).length > 0 && (
                      <p className="text-xs text-center pt-1" style={{color:C.muted}}>
                        其餘成員已結清
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Expense list */}
              <div className="rounded-2xl border overflow-hidden" style={{background:C.card, borderColor:C.border, boxShadow:C.cardShadow}}>
                <div className="flex items-center justify-between px-4 py-3 border-b" style={{borderColor:C.border}}>
                  <p className="text-[11px] font-black uppercase tracking-widest" style={{color:C.muted}}>費用明細</p>
                  {/* 只保留 CSV 匯出 */}
                  <button onClick={exportCSV} className="p-2 rounded-xl active:opacity-70"
                    style={{background:'#F4F7FA', color:C.muted}} title="匯出 CSV">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="7 10 12 15 17 10"/>
                      <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                  </button>
                </div>

                {expenses.length===0
                  ? <div className="px-4 py-10 text-center text-sm font-medium" style={{color:C.muted}}>尚無費用記錄，點右下＋新增</div>
                  : expenses.map((exp,idx,arr)=>{
                      const isBase = exp.currency===baseCurrency;
                      const converted = Math.round(exp.amount*(rates[exp.currency]??1));
                      const isEditing = editingExpId===exp.id;
                      return (
                        <div key={exp.id} className="px-4 py-4" style={{borderBottom:idx<arr.length-1?`1px solid ${C.border}`:'none'}}>
                          {isEditing ? (
                            /* 編輯模式 */
                            <div className="space-y-2">
                              <input value={editingExpData.title||''} onChange={e=>setEditingExpData(d=>({...d,title:e.target.value}))}
                                placeholder="名稱" className="w-full border rounded-xl px-3 py-2 text-sm font-bold"
                                style={{borderColor:C.primary, color:C.ink}}/>
                              <div className="flex gap-2">
                                <input type="number" value={editingExpData.amount||''} onChange={e=>setEditingExpData(d=>({...d,amount:parseFloat(e.target.value)||0}))}
                                  placeholder="金額" className="flex-1 border rounded-xl px-3 py-2 text-sm"
                                  style={{borderColor:C.border, color:C.ink}}/>
                                <select value={editingExpData.currency||baseCurrency} onChange={e=>setEditingExpData(d=>({...d,currency:e.target.value}))}
                                  className="border rounded-xl px-2 py-2 text-sm" style={{borderColor:C.border, color:C.body}}>
                                  {Object.keys(rates).map(c=><option key={c} value={c}>{c}</option>)}
                                </select>
                              </div>
                              {/* 即時換算預覽 */}
                              {editingExpData.amount>0 && editingExpData.currency && editingExpData.currency!==baseCurrency && (
                                <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
                                  style={{background:'#F0F5F9'}}>
                                  <span className="text-xs" style={{color:C.muted}}>≈</span>
                                  <span className="text-sm font-black" style={{color:'#B6C9CF'}}>
                                    {baseCurrency} {Math.round(editingExpData.amount*(rates[editingExpData.currency]??1)).toLocaleString()}
                                  </span>
                                  <span className="text-xs ml-auto" style={{color:C.muted}}>
                                    1 {editingExpData.currency} = {rates[editingExpData.currency]??'?'} {baseCurrency}
                                  </span>
                                </div>
                              )}
                              {/* 刪除：放在編輯表單最底，需二次確認 */}
                              <button onClick={()=>{
                                if(window.confirm('確定要刪除這筆費用嗎？')) deleteExp(editingExpData.id);
                              }} className="w-full py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5"
                                style={{background:C.dangerLight, color:C.danger}}>
                                <Trash2 size={13}/>刪除這筆費用
                              </button>
                              <div className="flex gap-2">
                                <button onClick={()=>setEditingExpId(null)} className="flex-1 py-2 rounded-xl text-sm font-bold" style={{background:'#F4F7FA', color:C.muted}}>取消</button>
                                <button onClick={saveEditExp} className="flex-1 py-2 rounded-xl text-sm font-bold text-white" style={{background:C.primary}}>儲存</button>
                              </div>
                            </div>
                          ) : (
                            /* 顯示模式 */
                            <div>
                              <div className="flex items-start justify-between gap-2 mb-1.5">
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-black" style={{color:C.ink}}>{exp.title}</p>
                                  {/* 分攤 pills */}
                                  <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                                    {(exp.splitWith||[exp.paidBy]).map(u=>(
                                      <span key={u} className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                                        style={{background:u===exp.paidBy?C.primaryLight:'#F4F7FA', color:u===exp.paidBy?C.primary:C.muted}}>
                                        {u}{u===exp.paidBy?' 付':''}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                                <div className="flex items-start gap-2 shrink-0">
                                  <div className="text-right">
                                    <p className="text-sm font-black" style={{color:C.ink}}>
                                      {exp.currency} {exp.amount.toLocaleString()}
                                    </p>
                                    {/* 換算（非基礎幣 → B6C9CF 輔助色） */}
                                    {!isBase && (
                                      <p className="text-xs font-bold mt-0.5" style={{color:'#B6C9CF'}}>
                                        ≈ {baseCurrency} {converted.toLocaleString()}
                                      </p>
                                    )}
                                  </div>
                                  {!readOnly && (
                                    <button onClick={()=>startEditExp(exp)} className="p-1.5 rounded-lg mt-0.5" style={{background:C.primaryLight, color:C.primary}}>
                                      <Edit2 size={13}/>
                                    </button>
                                  )}
                                </div>
                              </div>
                              <p className="text-[10px] font-medium" style={{color:C.muted}}>{exp.category}</p>
                            </div>
                          )}
                        </div>
                      );
                    })
                }
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ══ FAB ══ */}
      {!readOnly && (
        <div className="fixed z-50" style={{bottom:'76px', right:`max(16px, calc(50vw - 196px))`}}>
          {mode==='itinerary' && isEditMode && (
            <div className="flex flex-col gap-2 items-end">
              {/* 展開的子選項：點 + 後才出現 */}
              {fabOpen && (
                <>
                  <button
                    onClick={() => { showToast('新增交通 – 待接入'); setFabOpen(false); }}
                    className="fab flex items-center gap-2 pr-4 pl-3 py-2.5 rounded-full text-sm font-black text-white shadow-lg"
                    style={{background:C.primary+'DD', backdropFilter:'blur(8px)', boxShadow:`0 4px 16px ${C.primary}55`}}>
                    <Car size={16}/>交通
                  </button>
                  <button
                    onClick={() => { showToast('新增景點 – 待接入'); setFabOpen(false); }}
                    className="fab flex items-center gap-2 pr-4 pl-3 py-2.5 rounded-full text-sm font-black text-white shadow-lg"
                    style={{background:C.primary, boxShadow:`0 4px 20px ${C.primary}66`}}>
                    <MapPin size={16}/>景點
                  </button>
                </>
              )}
              {/* 主 FAB：+ 旋轉成 × */}
              <button
                onClick={() => setFabOpen(v => !v)}
                className="fab w-14 h-14 rounded-full flex items-center justify-center text-white shadow-xl"
                style={{
                  background: fabOpen ? C.ink : C.primary,
                  boxShadow: fabOpen ? '0 4px 20px rgba(0,0,0,0.35)' : `0 4px 24px ${C.primary}77`,
                  transform: fabOpen ? 'rotate(45deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s ease, background 0.2s ease',
                }}>
                <Plus size={26}/>
              </button>
            </div>
          )}
          {mode==='checklist' && (
            <button onClick={()=>setSheetOpen(true)}
              className="fab w-14 h-14 rounded-full flex items-center justify-center text-white shadow-xl"
              style={{background:C.primary, boxShadow:'0 4px 24px rgba(72,116,158,0.45)'}}>
              <Plus size={26}/>
            </button>
          )}
          {mode==='finance' && (
            <button onClick={()=>showToast('新增費用 – 表單待接入')}
              className="fab w-14 h-14 rounded-full flex items-center justify-center text-white shadow-xl"
              style={{background:C.primary, boxShadow:'0 4px 24px rgba(72,116,158,0.45)'}}>
              <Plus size={26}/>
            </button>
          )}
        </div>
      )}

      {/* ══ DETAIL / EDIT SHEET ══ */}
      {detailSheet && (
        <div className="fixed inset-0 z-[65] flex flex-col justify-end">
          <div className="absolute inset-0" style={{background:'rgba(0,0,0,0.3)'}} onClick={() => setDetailSheet(null)}/>
          <div className="relative flex flex-col rounded-t-3xl"
            style={{background:C.card, boxShadow:'0 -8px 40px rgba(0,0,0,0.15)', maxHeight:'88dvh'}}>

            {/* 把手 + Header */}
            <div className="shrink-0 px-5 pt-3 pb-3" style={{borderBottom:`1px solid ${C.border}`}}>
              <div className="flex justify-center mb-3">
                <div className="w-10 h-1 rounded-full" style={{background:C.border}}/>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-lg shrink-0">
                    {detailSheet.type==='transport' ? getTransportEmoji(detailData.transportMode||detailSheet.transportMode) : '📍'}
                  </span>
                  <p className="text-base font-black truncate" style={{color:C.ink}}>
                    {detailSheet.type==='transport'
                      ? (detailData.from||detailSheet.from||'') + (detailData.to||detailSheet.to ? ' → '+(detailData.to||detailSheet.to) : '') || detailSheet.title || '交通'
                      : (detailData.title||detailSheet.title)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={saveDetailSheet}
                    className="px-4 py-1.5 rounded-xl text-sm font-black"
                    style={{background:C.primary, color:'#fff'}}>
                    儲存
                  </button>
                  <button onClick={() => setDetailSheet(null)}
                    className="w-8 h-8 flex items-center justify-center rounded-full"
                    style={{background:'#F4F7FA', color:C.muted}}>
                    <X size={16}/>
                  </button>
                </div>
              </div>
            </div>

            {/* 可捲動表單內容 */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

              {detailSheet.type === 'transport' ? (
                /* ── 交通欄位 ── */
                <>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <p className="text-[10px] font-black uppercase tracking-widest mb-1.5" style={{color:C.muted}}>交通方式</p>
                      <input value={detailData.transportMode||''} onChange={e=>setDetailData(d=>({...d,transportMode:e.target.value}))}
                        placeholder="電車 / 巴士 / 飛機…"
                        className="w-full border rounded-xl px-3 py-2.5 text-sm"
                        style={{borderColor:C.border, color:C.ink}}/>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest mb-1.5" style={{color:C.muted}}>時間</p>
                      <input type="time" value={detailData.time||''} onChange={e=>setDetailData(d=>({...d,time:e.target.value}))}
                        className="border rounded-xl px-3 py-2.5 text-sm font-bold"
                        style={{borderColor:C.border, color:C.primary}}/>
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest mb-1.5" style={{color:C.muted}}>起訖站</p>
                    <div className="flex items-center gap-2">
                      <input value={detailData.from||''} onChange={e=>setDetailData(d=>({...d,from:e.target.value}))}
                        placeholder="出發地"
                        className="flex-1 border rounded-xl px-3 py-2.5 text-sm"
                        style={{borderColor:C.border, color:C.ink}}/>
                      <ArrowRight size={14} style={{color:C.primary, flexShrink:0}}/>
                      <input value={detailData.to||''} onChange={e=>setDetailData(d=>({...d,to:e.target.value}))}
                        placeholder="目的地"
                        className="flex-1 border rounded-xl px-3 py-2.5 text-sm"
                        style={{borderColor:C.border, color:C.ink}}/>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="flex-1">
                      <p className="text-[10px] font-black uppercase tracking-widest mb-1.5" style={{color:C.muted}}>班次 / 車次</p>
                      <input value={detailData.title||''} onChange={e=>setDetailData(d=>({...d,title:e.target.value}))}
                        placeholder="班次名稱"
                        className="w-full border rounded-xl px-3 py-2.5 text-sm"
                        style={{borderColor:C.border, color:C.ink}}/>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest mb-1.5" style={{color:C.muted}}>時長</p>
                      <input value={detailData.duration||''} onChange={e=>setDetailData(d=>({...d,duration:e.target.value}))}
                        placeholder="40 分鐘"
                        className="w-28 border rounded-xl px-3 py-2.5 text-sm"
                        style={{borderColor:C.border, color:C.ink}}/>
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest mb-1.5" style={{color:C.muted}}>票價</p>
                    <input value={detailData.tickets||''} onChange={e=>setDetailData(d=>({...d,tickets:e.target.value}))}
                      placeholder="JPY 920"
                      className="w-full border rounded-xl px-3 py-2.5 text-sm"
                      style={{borderColor:C.border, color:C.ink}}/>
                  </div>

                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest mb-1.5" style={{color:C.muted}}>備注</p>
                    <textarea value={detailData.notes||''} onChange={e=>setDetailData(d=>({...d,notes:e.target.value}))}
                      placeholder="注意事項、換乘資訊…"
                      rows={2}
                      className="w-full border rounded-xl px-3 py-2.5 text-sm resize-none"
                      style={{borderColor:C.border, color:C.ink}}/>
                  </div>

                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest mb-1.5" style={{color:C.muted}}>訂票連結</p>
                    <input value={detailData.website||''} onChange={e=>setDetailData(d=>({...d,website:e.target.value}))}
                      placeholder="https://..."
                      className="w-full border rounded-xl px-3 py-2.5 text-sm"
                      style={{borderColor:C.border, color:C.ink}}/>
                  </div>
                </>

              ) : (
                /* ── 景點欄位 ── */
                <>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest mb-1.5" style={{color:C.muted}}>時間</p>
                    <input type="time" value={detailData.time||''} onChange={e=>setDetailData(d=>({...d,time:e.target.value}))}
                      className="border rounded-xl px-3 py-2.5 text-sm font-bold"
                      style={{borderColor:C.border, color:C.primary}}/>
                  </div>

                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest mb-1.5" style={{color:C.muted}}>景點名稱</p>
                    <input value={detailData.title||''} onChange={e=>setDetailData(d=>({...d,title:e.target.value}))}
                      placeholder="景點名稱"
                      className="w-full border rounded-xl px-3 py-2.5 text-sm font-black"
                      style={{borderColor:C.primary, color:C.ink, boxShadow:`0 0 0 2px ${C.primary}22`}}/>
                  </div>

                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest mb-1.5" style={{color:C.muted}}>地點</p>
                    <input value={detailData.location||''} onChange={e=>setDetailData(d=>({...d,location:e.target.value}))}
                      placeholder="地址 / 地點名稱"
                      className="w-full border rounded-xl px-3 py-2.5 text-sm"
                      style={{borderColor:C.border, color:C.ink}}/>
                  </div>

                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest mb-1.5" style={{color:C.muted}}>備注</p>
                    <textarea value={detailData.notes||''} onChange={e=>setDetailData(d=>({...d,notes:e.target.value}))}
                      placeholder="注意事項、行前準備…"
                      rows={3}
                      className="w-full border rounded-xl px-3 py-2.5 text-sm resize-none"
                      style={{borderColor:C.border, color:C.ink}}/>
                  </div>

                  <div className="flex gap-3">
                    <div className="flex-1">
                      <p className="text-[10px] font-black uppercase tracking-widest mb-1.5" style={{color:C.muted}}>票價</p>
                      <input value={detailData.tickets||''} onChange={e=>setDetailData(d=>({...d,tickets:e.target.value}))}
                        placeholder="門票 / 票價"
                        className="w-full border rounded-xl px-3 py-2.5 text-sm"
                        style={{borderColor:C.border, color:C.ink}}/>
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] font-black uppercase tracking-widest mb-1.5" style={{color:C.muted}}>營業時間</p>
                      <input value={detailData.hours||''} onChange={e=>setDetailData(d=>({...d,hours:e.target.value}))}
                        placeholder="09:00–18:00"
                        className="w-full border rounded-xl px-3 py-2.5 text-sm"
                        style={{borderColor:C.border, color:C.ink}}/>
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest mb-1.5" style={{color:C.muted}}>網站</p>
                    <input value={detailData.website||''} onChange={e=>setDetailData(d=>({...d,website:e.target.value}))}
                      placeholder="https://..."
                      className="w-full border rounded-xl px-3 py-2.5 text-sm"
                      style={{borderColor:C.border, color:C.ink}}/>
                  </div>
                </>
              )}

            </div>

            {/* 固定底部：刪除按鈕 */}
            {!readOnly && (
              <div className="shrink-0 px-5 pt-3 pb-8" style={{borderTop:`1px solid ${C.border}`}}>
                <button
                  onClick={deleteFromDetail}
                  className="w-full py-3 rounded-2xl text-sm font-black flex items-center justify-center gap-2"
                  style={{background:C.dangerLight, color:C.danger}}>
                  <Trash2 size={15}/>刪除此行程
                </button>
              </div>
            )}

          </div>
        </div>
      )}

            {/* ══ CHECKLIST SHEET ══ */}
      {sheetOpen && (
        <div className="fixed inset-0 z-[60] flex flex-col justify-end">
          {/* 半透明遮罩 */}
          <div className="absolute inset-0" style={{background:'rgba(0,0,0,0.25)'}} onClick={()=>setSheetOpen(false)}/>
          {/* Sheet 本體 */}
          <div className="relative rounded-t-3xl pb-10"
            style={{background:C.card, boxShadow:'0 -8px 40px rgba(0,0,0,0.12)'}}>
            {/* 拖曳把手 */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 rounded-full" style={{background:C.border}}/>
            </div>
            <div className="px-5 pb-4">
              <p className="text-sm font-black mb-3" style={{color:C.ink}}>新增清單項目</p>
              <div className="flex gap-2">
                <input
                  ref={sheetInputRef}
                  type="text"
                  value={sheetInput}
                  onChange={e=>setSheetInput(e.target.value)}
                  onKeyDown={e=>e.key==='Enter'&&submitSheet()}
                  placeholder="輸入待準備事項…"
                  className="flex-1 border rounded-2xl px-4 py-3 text-sm font-medium"
                  style={{borderColor:C.border, color:C.ink}}/>
                <button onClick={submitSheet}
                  className="fab px-5 rounded-2xl font-black text-white"
                  style={{background:sheetInput.trim()?C.primary:C.muted, transition:'background 0.15s'}}>
                  <Plus size={20}/>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ EXPENSE QUICK-ADD SHEET ══ */}
      {expSheet && (
        <div className="fixed inset-0 z-[70] flex flex-col justify-end">

          {/* 遮罩 */}
          <div className="absolute inset-0" style={{background:'rgba(0,0,0,0.35)'}}
            onClick={()=>setExpSheet(null)}/>

          {/* Sheet 本體：max-height 限制 + flex 分層 */}
          <div className="relative flex flex-col rounded-t-3xl"
            style={{
              background: C.card,
              boxShadow: '0 -8px 40px rgba(0,0,0,0.18)',
              maxHeight: '88dvh',   // 最多佔螢幕 88%
            }}>

            {/* ── 固定：把手 + 標題 ── */}
            <div className="shrink-0 px-5 pt-3 pb-3"
              style={{borderBottom:`1px solid ${C.border}`}}>
              {/* 把手 */}
              <div className="flex justify-center mb-3">
                <div className="w-10 h-1 rounded-full" style={{background:C.border}}/>
              </div>
              {/* 標題 + 關閉 */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-base font-black" style={{color:C.ink}}>記一筆</p>
                  <p className="text-xs mt-0.5" style={{color:C.muted}}>來自：{expSheet.sourceTitle}</p>
                </div>
                <button onClick={()=>setExpSheet(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-full"
                  style={{background:'#F4F7FA', color:C.muted}}>
                  <X size={16}/>
                </button>
              </div>
            </div>

            {/* ── 可捲動內容區 ── */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4"
              style={{WebkitOverflowScrolling:'touch'}}>

              {/* 費用名稱 */}
              <input
                value={expSheetTitle}
                onChange={e=>setExpSheetTitle(e.target.value)}
                placeholder={`費用名稱（預設：${expSheet.sourceTitle}）`}
                className="w-full border rounded-2xl px-4 py-3 text-sm"
                style={{borderColor:C.border, color:C.ink}}/>

              {/* 金額列：大字輸入 + 幣別並排 */}
              <div className="rounded-2xl border p-4 space-y-3"
                style={{borderColor: expSheetAmt ? C.primary : C.border,
                        boxShadow: expSheetAmt ? `0 0 0 3px ${C.primary}18` : 'none',
                        transition: 'border-color 0.15s, box-shadow 0.15s'}}>
                <div className="flex items-center gap-3">
                  <input
                    ref={expSheetAmtRef}
                    type="number"
                    inputMode="decimal"
                    value={expSheetAmt}
                    onChange={e=>setExpSheetAmt(e.target.value)}
                    placeholder="0"
                    className="flex-1 text-3xl font-black bg-transparent"
                    style={{color: expSheetAmt ? C.ink : C.muted, minWidth:0}}/>
                  <select
                    value={expSheetCur}
                    onChange={e=>setExpSheetCur(e.target.value)}
                    className="border rounded-xl px-3 py-2 text-sm font-bold shrink-0"
                    style={{borderColor:C.border, color:C.body}}>
                    {Object.keys(rates).map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                {/* 換算預覽（僅外幣） */}
                {expSheetAmt>0 && expSheetCur!==baseCurrency && (
                  <div className="flex items-center gap-2 pt-2"
                    style={{borderTop:`1px solid ${C.border}`}}>
                    <span className="text-xs" style={{color:C.muted}}>≈</span>
                    <span className="text-sm font-black" style={{color:'#B6C9CF'}}>
                      {baseCurrency} {Math.round(parseFloat(expSheetAmt||0)*(rates[expSheetCur]??1)).toLocaleString()}
                    </span>
                    <span className="text-xs ml-auto" style={{color:C.muted}}>
                      1 {expSheetCur} = {rates[expSheetCur]} {baseCurrency}
                    </span>
                  </div>
                )}
              </div>

              {/* 類別 */}
              <div>
                <p className="text-[11px] font-black uppercase tracking-widest mb-2" style={{color:C.muted}}>類別</p>
                <div className="flex flex-wrap gap-2">
                  {categories.map(cat=>(
                    <button key={cat} onClick={()=>setExpSheetCat(cat)}
                      className="px-3 py-1.5 rounded-full text-xs font-bold"
                      style={expSheetCat===cat
                        ? {background:C.primary, color:'#fff'}
                        : {background:'#F4F7FA', color:C.body, border:`1px solid ${C.border}`}}>
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* 誰付款 */}
              <div>
                <p className="text-[11px] font-black uppercase tracking-widest mb-2" style={{color:C.muted}}>誰付款</p>
                <div className="flex gap-2 flex-wrap">
                  {users.map(u=>(
                    <button key={u} onClick={()=>setExpSheetPaidBy(u)}
                      className="px-4 py-2 rounded-xl text-sm font-bold"
                      style={expSheetPaidBy===u
                        ? {background:C.primary, color:'#fff'}
                        : {background:'#F4F7FA', color:C.body, border:`1px solid ${C.border}`}}>
                      {u}
                    </button>
                  ))}
                </div>
              </div>

              {/* 分攤方式 */}
              {users.length > 1 && (
                <div>
                  <p className="text-[11px] font-black uppercase tracking-widest mb-2" style={{color:C.muted}}>分攤方式</p>
                  {/* 模式切換 */}
                  <div className="flex gap-2 mb-3">
                    {[['equal','平分'],['custom','自訂'],['self','各付各的']].map(([mode,label])=>(
                      <button key={mode} onClick={()=>{
                        setSplitMode(mode);
                        if (mode==='equal') setExpSheetSplit([...users]);
                        else if (mode==='self') setExpSheetSplit([expSheetPaidBy]);
                      }}
                        className="flex-1 py-2 rounded-xl text-xs font-black"
                        style={splitMode===mode
                          ? {background:C.primary, color:'#fff'}
                          : {background:'#F4F7FA', color:C.muted, border:`1px solid ${C.border}`}}>
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* 平分：顯示每人金額 */}
                  {splitMode==='equal' && expSheetAmt>0 && (
                    <p className="text-xs mb-2" style={{color:C.muted}}>
                      每人 {expSheetCur} {(parseFloat(expSheetAmt)/users.length).toFixed(0)}
                    </p>
                  )}

                  {/* 自訂：各自輸入金額 */}
                  {splitMode==='custom' && (
                    <div className="space-y-2 mb-2">
                      {users.map(u=>(
                        <div key={u} className="flex items-center gap-2">
                          <span className="text-sm font-bold w-16 shrink-0" style={{color:C.ink}}>{u}</span>
                          <input type="number" inputMode="decimal"
                            value={customAmounts[u]||''}
                            onChange={e=>setCustomAmounts(prev=>({...prev,[u]:e.target.value}))}
                            placeholder="0"
                            className="flex-1 border rounded-xl px-3 py-2 text-sm"
                            style={{borderColor:C.border, color:C.ink}}/>
                          <span className="text-xs shrink-0" style={{color:C.muted}}>{expSheetCur}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 各付各的：勾選哪些人參與（各付自己那份） */}
                  {splitMode==='self' && (
                    <div className="flex gap-2 flex-wrap">
                      {users.map(u=>(
                        <button key={u} onClick={()=>toggleSplitUser(u)}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold"
                          style={expSheetSplit.includes(u)
                            ? {background:C.primaryLight, color:C.primary, border:`1.5px solid ${C.primary}`}
                            : {background:'#F4F7FA', color:C.muted, border:`1px solid ${C.border}`}}>
                          {expSheetSplit.includes(u) && <Check size={12}/>}
                          {u}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* 平分預設所有人都打勾（不顯示勾選介面，改用上方描述） */}
                  {splitMode==='equal' && (
                    <div className="flex gap-2 flex-wrap">
                      {users.map(u=>(
                        <span key={u} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold"
                          style={{background:C.primaryLight, color:C.primary}}>
                          <Check size={11}/>{u}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── 固定：送出按鈕（不隨內容捲動）── */}
            <div className="shrink-0 px-5 pt-3 pb-8"
              style={{borderTop:`1px solid ${C.border}`}}>
              <button onClick={submitExpSheet}
                className="w-full py-3.5 rounded-2xl text-sm font-black text-white"
                style={{
                  background: (expSheetAmt && parseFloat(expSheetAmt)>0 && expSheetPaidBy)
                    ? C.primary : C.muted,
                  transition: 'background 0.15s',
                }}>
                記帳完成
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ BOTTOM NAV ══ */}
      <nav className="shrink-0 z-40" style={{background:C.primary}}>
        <div className="flex px-2 py-1">
          {[
            {id:'checklist',icon:ListTodo,label:'行前清單'},
            {id:'itinerary',icon:Map,     label:'行程計畫'},
            {id:'finance',  icon:Wallet,  label:'記帳分帳'},
          ].map(({id,icon:Icon,label})=>(
            <button key={id} onClick={()=>setMode(id)}
              className="flex-1 flex flex-col items-center gap-1 py-3 transition-all"
              style={{color:mode===id?'#FFFFFF':'rgba(255,255,255,0.45)'}}>
              <Icon size={22} strokeWidth={mode===id?2.5:1.8}/>
              <span className="text-[10px] font-black tracking-wide">{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
