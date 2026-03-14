import React, { useState, useMemo, useEffect, useRef } from 'react';
import { doc, updateDoc, serverTimestamp, setDoc, getDocs, getDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import {
  MapPin, Clock, Globe, ShoppingBag, Ticket, Navigation,
  Car, Plus, Edit2, Trash2, DollarSign, PieChart, Download,
  ChevronUp, ChevronDown, Check, X, Users, CreditCard,
  ListTodo, ToggleLeft, ToggleRight, Calendar,
  Settings, Lock, Unlock, Tag, Save, Star, Plane, Luggage,
  Camera as CameraIcon, ArrowLeft, ArrowRight,
  Share2, ChevronUpIcon, WifiOff, Zap, MoveRight, Hotel,
} from 'lucide-react';
import ExpenseFormModal from './ExpenseFormModal';
import { useConfirm } from './ConfirmModal';

const TRIP_ICONS  = [Plane, MapPin, Luggage, CameraIcon];
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

// 產生日期區間內所有日期
function getDatesInRange(start, end) {
  if (!start || !end) return [];
  const dates = [];
  const cur = new Date(start);
  const last = new Date(end);
  while (cur <= last) {
    dates.push(cur.toISOString().split('T')[0]);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

// ─── Component ────────────────────────────────────────────────────────────────
// 解析 Google Maps URL，取出地點名稱
function parseGoogleMapsUrl(url) {
  if (!url) return null;
  try {
    const placeMatch = url.match(/maps\/place\/([^/@?&]+)/);
    if (placeMatch) return decodeURIComponent(placeMatch[1].replace(/\+/g, ' '));
    const searchMatch = url.match(/maps\/search\/([^/@?&]+)/);
    if (searchMatch) return decodeURIComponent(searchMatch[1].replace(/\+/g, ' '));
  } catch (e) {}
  return null;
}

// Markdown 解析器
function parseMarkdown(mdText) {
  const lines = mdText.split('\n');
  const itineraryItems = [];
  const checklistItems = [];
  let currentDate = '';
  let currentItem = null;
  let inChecklist = false;
  let inTodo = false;
  let inShopping = false;

  const flushItem = () => {
    if (currentItem && currentItem.title) {
      // 需提前購票 → 自動加行前清單
      if (currentItem.transportNeedTicket && currentItem.title) {
        checklistItems.push({ id: crypto.randomUUID(), text: `購票：${currentItem.title}`, checked: false, autoAdded: true });
      }
      itineraryItems.push({ ...currentItem, id: crypto.randomUUID() });
    }
    currentItem = null;
    inTodo = false;
    inShopping = false;
  };

  for (let raw of lines) {
    const line = raw;
    const trimmed = line.trim();

    // ## 日期區塊
    if (trimmed.startsWith('## ')) {
      flushItem();
      const dateMatch = trimmed.match(/(\d{4}-\d{2}-\d{2})/);
      if (dateMatch) { currentDate = dateMatch[1]; inChecklist = false; }
      else if (trimmed.includes('清單') || trimmed.includes('checklist')) { inChecklist = true; }
      continue;
    }

    // 行前清單
    if (inChecklist) {
      if (trimmed.match(/^-\s*\[( |x|X)\]\s+/)) {
        const checked = trimmed.match(/^-\s*\[x\]/i) !== null;
        const text = trimmed.replace(/^-\s*\[[ xX]\]\s*/, '').trim();
        if (text) checklistItems.push({ id: crypto.randomUUID(), text, checked });
      }
      continue;
    }

    // 景點開始 (- time: 或 - title:)
    if (trimmed.startsWith('- time:') || trimmed.startsWith('- title:')) {
      flushItem();
      currentItem = { date: currentDate, time: '', title: '', location: '', transport: '',
        transportDeparture: '', transportDuration: '', transportPrice: '', transportUrl: '',
        transportNeedTicket: false, notes: '', website: '', hours: '', tickets: '',
        shoppingList: [], todoList: [] };
      inTodo = false; inShopping = false;
    }

    if (!currentItem) continue;

    // key: value 欄位
    const kvMatch = trimmed.match(/^-?\s*(\w+):\s*(.*)/);
    if (kvMatch) {
      const [, key, val] = kvMatch;
      const v = val.trim();
      switch (key) {
        case 'time':               currentItem.time = v; break;
        case 'title':              currentItem.title = v; break;
        case 'location':           currentItem.location = v; break;
        case 'transport':          currentItem.transport = v; break;
        case 'transport_departure':currentItem.transportDeparture = v; break;
        case 'transport_duration': currentItem.transportDuration = v; break;
        case 'transport_price':    currentItem.transportPrice = v; break;
        case 'transport_url':      currentItem.transportUrl = v; break;
        case 'transport_ticket':   currentItem.transportNeedTicket = v === 'true'; break;
        case 'hours':              currentItem.hours = v; break;
        case 'website':            currentItem.website = v; break;
        case 'notes':              currentItem.notes = v; break;
        case 'tickets':            currentItem.tickets = v; break;
        case 'todo':               inTodo = true; inShopping = false; break;
        case 'shopping':           inShopping = true; inTodo = false; break;
      }
    } else if (trimmed.startsWith('- ') && currentItem) {
      const text = trimmed.replace(/^-\s+/, '').trim();
      if (inTodo && text) currentItem.todoList = [...(currentItem.todoList||[]), { id: crypto.randomUUID(), text, checked: false }];
      else if (inShopping && text) currentItem.shoppingList = [...(currentItem.shoppingList||[]), { id: crypto.randomUUID(), text, checked: false }];
    }
  }
  flushItem();
  return { itineraryItems, checklistItems };
}

// 舊資料單段交通 → 新多段格式
function normalizeTransportSegments(item) {
  if (item.transportSegments && item.transportSegments.length > 0) return item.transportSegments;
  if (item.transport || item.transportDeparture || item.transportDuration || item.transportPrice || item.transportUrl) {
    return [{ id: crypto.randomUUID(), mode: item.transport||'', departure: item.transportDeparture||'', duration: item.transportDuration||'', price: item.transportPrice||'', url: item.transportUrl||'', needTicket: item.transportNeedTicket||false }];
  }
  return [];
}

// 空白交通段
function emptySegment() {
  return { id: crypto.randomUUID(), mode:'', departure:'', duration:'', price:'', url:'', needTicket:false };
}

export default function TripApp({ uid, currentUserUid, currentUserName, tripId, initialData, readOnly = false, onBack }) {
  const { confirm, ConfirmUI } = useConfirm();
  const isOwner = uid === currentUserUid;

  // ── Core state ────────────────────────────────────────────────────────────
  const [tripName,      setTripName]      = useState(initialData.name         || '新旅程');
  const [tripIconIndex, setTripIconIndex] = useState(initialData.iconIndex    ?? 0);
  const [tripStartDate, setTripStartDate] = useState(initialData.tripStartDate || '');
  const [tripEndDate,   setTripEndDate]   = useState(initialData.tripEndDate   || '');
  const [users,         setUsers]         = useState(initialData.users         || ['自己']);
  const [rates,         setRates]         = useState(initialData.rates         || { TWD: 1, JPY: 0.21, USD: 31.5 });
  const [baseCurrency,  setBaseCurrency]  = useState(initialData.baseCurrency  || 'TWD');
  const [categories,    setCategories]    = useState(initialData.categories    || ['飲食','交通','住宿','購物','娛樂','門票','其他']);
  const [checklist,     setChecklist]     = useState(initialData.checklist     || []);
  const [itinerary,     setItinerary]     = useState(initialData.itinerary     || []);
  const [expenses,      setExpenses]      = useState(initialData.expenses      || []);
  const [flexTodos,     setFlexTodos]     = useState(initialData.flexTodos     || []);
  const [accommodations, setAccommodations] = useState(initialData.accommodations || []); // [{date, name, location}]
  const [showAddAccom,  setShowAddAccom]  = useState(false);
  const [newAccomDate,  setNewAccomDate]  = useState('');
  const [newAccomName,  setNewAccomName]  = useState('');
  const [newAccomLoc,   setNewAccomLoc]   = useState('');

  // ── UI state ──────────────────────────────────────────────────────────────
  const [mode,             setMode]             = useState('checklist');
  const [listTab,          setListTab]          = useState('pretrip');
  const [isEditMode,       setIsEditMode]       = useState(false);
  const [expandedItems,    setExpandedItems]    = useState(new Set());
  const [isSettingsOpen,   setIsSettingsOpen]   = useState(false);
  const [isEditModalOpen,  setIsEditModalOpen]  = useState(false);
  const [editingItem,      setEditingItem]      = useState(null);
  const [addingExpenseFor, setAddingExpenseFor] = useState(null);
  const [editingExpense,   setEditingExpense]   = useState(null);
  const [isEditingName,    setIsEditingName]    = useState(false);
  const [saveStatus,       setSaveStatus]       = useState('saved');
  const [toast,            setToast]            = useState(''); // 輕量提示

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2000); };
  const [isEditingDates,   setIsEditingDates]   = useState(false);
  const [flexCollapsed,    setFlexCollapsed]    = useState(false);
  const [expandedTransport,setExpandedTransport] = useState(new Set()); // 展開交通詳情的景點 id
  const [isOptionalOpen,   setIsOptionalOpen]   = useState(false); // 編輯 modal 的選填區

  // ── Offline & scroll state ─────────────────────────────────────────────
  const [isOnline,         setIsOnline]         = useState(navigator.onLine);
  const [showScrollTop,    setShowScrollTop]    = useState(false);

  useEffect(() => {
    const on  = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online',  on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  useEffect(() => {
    const handler = () => setShowScrollTop(window.scrollY > 300);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  // ── Share state ───────────────────────────────────────────────────────────
  const [isShareOpen,   setIsShareOpen]   = useState(false);
  const [shareEditors,  setShareEditors]  = useState(initialData.editors  || []);
  const [shareViewers,  setShareViewers]  = useState(initialData.viewers  || []);
  const [newShareEmail, setNewShareEmail] = useState('');
  const [newShareRole,  setNewShareRole]  = useState('viewer');
  const [shareStatus,   setShareStatus]   = useState('');
  const [shareEmailMap, setShareEmailMap] = useState({});

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

  const [isMarkdownImportOpen, setIsMarkdownImportOpen] = useState(false);
  const [markdownText,         setMarkdownText]         = useState('');
  const [markdownStatus,       setMarkdownStatus]       = useState('');

  // 點選移動排序（取代拖曳）
  const [movingId, setMovingId] = useState(null); // 正在移動中的景點 id

  const tripNameRef = useRef(null);
  const TripIcon = TRIP_ICONS[tripIconIndex % TRIP_ICONS.length];

  useEffect(() => { if (isEditingName) tripNameRef.current?.focus(); }, [isEditingName]);

  // ── 載入共享成員 email（重新進入後不顯示 UID）─────────────────────────────
  useEffect(() => {
    const allUids = [...(initialData.editors || []), ...(initialData.viewers || [])];
    if (allUids.length === 0) return;
    const loadEmails = async () => {
      const map = {};
      for (const targetUid of allUids) {
        try {
          const snap = await getDoc(doc(db, 'userProfiles', targetUid));
          if (snap.exists()) map[targetUid] = snap.data().email || targetUid;
        } catch (e) { /* ignore */ }
      }
      setShareEmailMap(map);
    };
    loadEmails();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Firebase auto-save ────────────────────────────────────────────────────
  const payload = useMemo(() => ({
    name: tripName, iconIndex: tripIconIndex,
    tripStartDate, tripEndDate,
    users, rates, baseCurrency, categories, checklist, itinerary, expenses, flexTodos, accommodations,
  }), [tripName, tripIconIndex, tripStartDate, tripEndDate, users, rates, baseCurrency, categories, checklist, itinerary, expenses, flexTodos, accommodations]);

  const debouncedPayload = useDebounce(payload, 1200);
  const isFirstSave = useRef(true);

  useEffect(() => {
    if (isFirstSave.current) { isFirstSave.current = false; return; }
    if (readOnly) return;
    setSaveStatus('saving');
    updateDoc(doc(db, 'users', uid, 'trips', tripId), { ...debouncedPayload, updatedAt: serverTimestamp() })
      .then(() => setSaveStatus('saved'))
      .catch(() => setSaveStatus('error'));
  }, [debouncedPayload, uid, tripId, readOnly]);

  // ① expenses 即時同步（onSnapshot）
  const isLocalExpenseUpdate = useRef(false);
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'users', uid, 'trips', tripId), (snap) => {
      if (!snap.exists()) return;
      if (isLocalExpenseUpdate.current) { isLocalExpenseUpdate.current = false; return; }
      const remoteExpenses = snap.data().expenses;
      if (remoteExpenses) setExpenses(remoteExpenses);
    });
    return () => unsub();
  }, [uid, tripId]);

  // ── Date helpers ──────────────────────────────────────────────────────────
  const fmtDate = (dateStr) => {
    if (!dateStr) return '未定日期';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return `${d.getMonth()+1}/${d.getDate()}(${'日一二三四五六'[d.getDay()]})`;
  };

  const fmtShort = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${d.getMonth()+1}/${d.getDate()}`;
  };

  const tripDayLabel = (dateStr) => {
    if (!tripStartDate || !dateStr) return fmtDate(dateStr);
    const start = new Date(tripStartDate);
    const target = new Date(dateStr);
    const dayN = Math.round((target - start) / (1000*60*60*24)) + 1;
    if (dayN < 1) return fmtDate(dateStr);
    return `第 ${dayN} 天\u3000${fmtDate(dateStr)}`;
  };

  // 行程日期列表（用於 Day selector）
  const tripDateRange = useMemo(() => getDatesInRange(tripStartDate, tripEndDate), [tripStartDate, tripEndDate]);

  const scrollToDate = (d) => document.getElementById(`date-${d}`)?.scrollIntoView({ behavior:'smooth', block:'start' });

  // ── Itinerary helpers ──────────────────────────────────────────────────────
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
    // 確保儲存 transportSegments，舊欄位保留供相容
    const segments = item.transportSegments || [];
    const withMeta = {
      ...item,
      transportSegments: segments,
      // 同步舊欄位（第一段）供 CSV 匯出等相容使用
      transport: segments[0]?.mode || '',
      transportDeparture: segments[0]?.departure || '',
      transportDuration: segments[0]?.duration || '',
      transportPrice: segments[0]?.price || '',
      transportUrl: segments[0]?.url || '',
      transportNeedTicket: segments[0]?.needTicket || false,
      lastEditedBy: currentUserName || '未知',
      lastEditedAt: new Date().toISOString(),
    };
    if (item.id) setItinerary(itinerary.map(i => i.id === item.id ? withMeta : i));
    else         setItinerary([...itinerary, { ...withMeta, id: crypto.randomUUID() }]);
    setIsEditModalOpen(false);
    setModalNewShop('');
    setIsOptionalOpen(false);
  };

  const deleteItineraryItem = async (id) => {
    if (await confirm('確定要刪除這個行程嗎？')) setItinerary(itinerary.filter(i => i.id !== id));
  };

  // 長按拖曳排序
  // 點選移動：點「移動」選中 → 點目標景點插入到該位置之前
  const handleTapMove = (targetId) => {
    if (!movingId) return;
    if (movingId === targetId) { setMovingId(null); return; }
    setItinerary(prev => {
      const arr = [...prev];
      const fromIdx = arr.findIndex(i => i.id === movingId);
      const toIdx   = arr.findIndex(i => i.id === targetId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const item = { ...arr[fromIdx], date: arr[toIdx].date };
      arr.splice(fromIdx, 1);
      const newTo = arr.findIndex(i => i.id === targetId);
      arr.splice(newTo, 0, item);
      return arr;
    });
    setMovingId(null);
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
  const toggleShop    = (iId, sId) => setItinerary(itinerary.map(i => i.id===iId ? {...i, shoppingList:(i.shoppingList||[]).map(s=>s.id===sId?{...s,checked:!s.checked}:s)}:i));
  const addModalShop  = () => { if (!modalNewShop.trim()) return; setEditingItem(prev=>({...prev,shoppingList:[...(prev.shoppingList||[]),{id:crypto.randomUUID(),text:modalNewShop,checked:false}]})); setModalNewShop(''); };
  const delModalShop  = (sId) => setEditingItem(prev=>({...prev,shoppingList:(prev.shoppingList||[]).filter(s=>s.id!==sId)}));
  const addGlobalShop = () => {
    if (!globalShopId || !globalNewShop.trim()) return;
    setItinerary(itinerary.map(i=>i.id===globalShopId?{...i,shoppingList:[...(i.shoppingList||[]),{id:crypto.randomUUID(),text:globalNewShop,checked:false}]}:i));
    setGlobalNewShop('');
  };
  const delGlobalShop = async (iId, sId) => {
    if (await confirm('刪除此購物項目？','確認刪除'))
      setItinerary(itinerary.map(i=>i.id===iId?{...i,shoppingList:(i.shoppingList||[]).filter(s=>s.id!==sId)}:i));
  };

  // ── Users settings ─────────────────────────────────────────────────────────
  const addUser = () => {
    if (newUser.trim() && !users.includes(newUser.trim())) { setUsers([...users, newUser.trim()]); setNewUser(''); }
  };
  const saveEditedUser = (old) => {
    const nw = editUserValue.trim();
    if (!nw || nw===old) { setEditingUserId(null); return; }
    if (users.includes(nw)) { alert('此名稱已存在！'); return; }
    setUsers(users.map(u=>u===old?nw:u));
    setExpenses(expenses.map(exp=>{
      let e={...exp};
      if (e.paidBy===old) e.paidBy=nw;
      e.splitAmong=(e.splitAmong||[]).map(u=>u===old?nw:u);
      if (e.customSplit?.[old]!==undefined){const v=e.customSplit[old];const cs={...e.customSplit};delete cs[old];cs[nw]=v;e.customSplit=cs;}
      return e;
    }));
    setEditingUserId(null);
  };
  const removeUser = async (u, idx) => {
    // 保護：建立者（第一位）不可刪除，且至少保留一人
    if (idx === 0) { alert('建立者不可被刪除'); return; }
    if (users.length <= 1) { alert('至少需要保留一位成員'); return; }
    if (!isOwner) { alert('只有行程擁有者可以刪除成員'); return; }
    if (!await confirm(`刪除「${u}」？\n系統將重新分配其相關花費。`, '確認刪除')) return;
    const remaining = users.filter(x=>x!==u);
    setUsers(remaining);
    setExpenses(expenses.map(exp=>{
      let e={...exp};
      if (e.paidBy===u) e.paidBy=remaining[0]||'';
      if (e.splitMode==='custom'&&e.customSplit?.[u]!==undefined){
        const amt=Number(e.customSplit[u])||0;const cs={...e.customSplit};delete cs[u];
        if(amt>0&&cs[e.paidBy]!==undefined)cs[e.paidBy]=(Number(cs[e.paidBy])||0)+amt;
        e.customSplit=cs;
      } else if (e.splitMode==='equal') {
        e.splitAmong=(e.splitAmong||[]).filter(x=>x!==u);
      }
      return e;
    }));
  };

  // ── Categories settings ────────────────────────────────────────────────────
  const addCategory   = () => { if (newCategory.trim()&&!categories.includes(newCategory.trim())){setCategories([...categories,newCategory.trim()]);setNewCategory('');} };
  const saveEditedCat = (old) => {
    const nw=editCatValue.trim();
    if (!nw||nw===old){setEditingCatId(null);return;}
    if (categories.includes(nw)){alert('此分類已存在！');return;}
    setCategories(categories.map(c=>c===old?nw:c));
    setExpenses(expenses.map(e=>e.category===old?{...e,category:nw}:e));
    setEditingCatId(null);
  };
  const removeCat = (c) => setCategories(categories.filter(x=>x!==c));

  // ── Rates settings ─────────────────────────────────────────────────────────
  const addRate    = () => { if(newCurrency.trim()&&newRateValue){setRates({...rates,[newCurrency.trim().toUpperCase()]:parseFloat(newRateValue)});setNewCurrency('');setNewRateValue('');} };
  const updateRate = (c,v) => { if(v) setRates({...rates,[c]:parseFloat(v)}); };
  const removeRate = async (c) => {
    if (c===baseCurrency){alert('基準幣別不可刪除');return;}
    if (await confirm(`刪除 ${c}？`,'確認刪除')){const r={...rates};delete r[c];setRates(r);}
  };

  // ── Expenses ───────────────────────────────────────────────────────────────
  const saveExpense = (exp) => {
    isLocalExpenseUpdate.current = true;
    if (exp.id) setExpenses(expenses.map(e=>e.id===exp.id?exp:e));
    else        setExpenses([...expenses,{...exp,id:crypto.randomUUID()}]);
    setAddingExpenseFor(null);
    setEditingExpense(null);
    showToast(exp.id ? '✅ 已更新帳務' : '✅ 已記帳');
  };
  const deleteExpense = async (id) => {
    if (await confirm('確定刪除此筆紀錄？','確認刪除')){
      isLocalExpenseUpdate.current = true;
      setExpenses(expenses.filter(e=>e.id!==id));
      showToast('🗑 已刪除');
    }
  };

  // ── Finance calculations ───────────────────────────────────────────────────
  const convertedExpenses = useMemo(() => expenses.map(exp=>{
    const expRate=rates[exp.currency]||1;
    const baseRate=rates[baseCurrency]||1;
    const baseAmount=(exp.amount*expRate)/baseRate;
    return {...exp,baseAmount,rateUsed:expRate/baseRate};
  }),[expenses,rates,baseCurrency]);

  const financeSummary = useMemo(()=>{
    let total=0;
    const userStats=users.reduce((acc,u)=>({...acc,[u]:{paid:0,consumed:0}}),{});
    convertedExpenses.forEach(exp=>{
      if(exp.splitMode==='aa'){
        // AA 制：每人各付 amount，paid=consumed，不影響結算
        const perPerson = exp.baseAmount; // amount 即為每人金額
        (exp.aaSplitAmong||exp.splitAmong||[]).forEach(u=>{
          if(userStats[u]){userStats[u].paid+=perPerson;userStats[u].consumed+=perPerson;}
        });
        total+=perPerson*(exp.aaSplitAmong||exp.splitAmong||[]).length;
      } else {
        total+=exp.baseAmount;
        if(userStats[exp.paidBy])userStats[exp.paidBy].paid+=exp.baseAmount;
        if(exp.splitMode==='custom'&&exp.customSplit){
          Object.entries(exp.customSplit).forEach(([u,amt])=>{if(userStats[u])userStats[u].consumed+=Number(amt)*exp.rateUsed;});
        } else {
          const cnt=exp.splitAmong?.length||0;
          if(cnt>0){const pp=exp.baseAmount/cnt;(exp.splitAmong||[]).forEach(u=>{if(userStats[u])userStats[u].consumed+=pp;});}
        }
      }
    });
    return {total,userStats};
  },[convertedExpenses,users]);

  const settlement = useMemo(()=>calcSettlement(financeSummary.userStats),[financeSummary]);

  // ── Export CSV ─────────────────────────────────────────────────────────────
  const exportCSV = () => {
    const tripDateInfo = tripStartDate && tripEndDate ? `${tripStartDate} ~ ${tripEndDate}` : tripStartDate || '未設定';
    let csv = `\uFEFF旅程名稱,${tripName}\n旅行日期,${tripDateInfo}\n基準幣別,${baseCurrency}\n\n`;
    csv += '日期/時間,關聯行程,分類,描述,原始金額,幣別,換算金額('+baseCurrency+'),付款人,' + users.map(u=>`[${u}]需付(${baseCurrency})`).join(',') + '\n';
    expenses.forEach(exp=>{
      const rel=itinerary.find(i=>i.id===exp.itineraryId);
      const expRate=rates[exp.currency]||1;
      const baseRate=rates[baseCurrency]||1;
      const converted=((exp.amount*expRate)/baseRate).toFixed(2);
      const splits=users.map(u=>{
        if(exp.splitMode==='custom')return((exp.customSplit?.[u]||0)*(expRate/baseRate)).toFixed(2);
        if((exp.splitAmong||[]).includes(u))return(((exp.amount/(exp.splitAmong.length||1))*expRate/baseRate).toFixed(2));
        return '0';
      });
      const row=[rel?`${rel.date} ${rel.time}`:'無',rel?rel.title:'無',exp.category||'其他',exp.description,exp.amount,exp.currency,converted,exp.paidBy,...splits].map(f=>`"${String(f).replace(/"/g,'""')}"`).join(',');
      csv+=row+'\n';
    });
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
    a.download=`${tripName}-花費明細.csv`;
    document.body.appendChild(a);a.click();document.body.removeChild(a);
  };

  // Markdown 匯入
  const handleMarkdownImport = () => {
    if (!markdownText.trim()) { setMarkdownStatus('❌ 請貼上 Markdown 內容'); return; }
    try {
      const { itineraryItems, checklistItems } = parseMarkdown(markdownText);
      setItinerary(prev => [...prev, ...itineraryItems]);
      setChecklist(prev => [...prev, ...checklistItems]);
      setMarkdownStatus(`✅ 已匯入 ${itineraryItems.length} 個景點、${checklistItems.length} 個清單項目`);
      setMarkdownText('');
      setTimeout(() => { setIsMarkdownImportOpen(false); setMarkdownStatus(''); }, 1500);
    } catch(e) {
      setMarkdownStatus('❌ 格式錯誤，請確認 Markdown 格式');
    }
  };

  // 下載範例 Markdown
  const downloadSampleMarkdown = () => {
    const sample = `# 旅程名稱（選填）

## 2025-05-01
- time: 09:00
  title: 關西國際機場
  location: 關西國際機場
  transport: 關空特急 Haruka
  transport_departure: 09:30
  transport_duration: 75分鐘
  transport_price: 3600
  transport_url: https://www.westjr.co.jp/global/tc/
  transport_ticket: true
  hours: 24小時
  notes: 入境後換 IC 卡，前往大阪市區
  tickets: 已預購
  todo:
    - 換日幣
    - 購買 ICOCA 卡
  shopping:
    - 零食

- time: 12:00
  title: 大阪城
  location: 大阪城公園
  transport: 地鐵
  transport_departure: 14:00
  transport_duration: 20分鐘
  transport_price: 230
  hours: 09:00-17:00
  notes: 天守閣需購票
  tickets: 成人 600 日圓

## 行前清單
- [ ] 訂機票
- [ ] 換日幣
- [x] 申請國際駕照
`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([sample], { type: 'text/markdown;charset=utf-8;' }));
    a.download = '行程匯入範例.md';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };
  const addShareMember = async () => {
    const email = newShareEmail.trim().toLowerCase();
    if (!email||!email.includes('@')){setShareStatus('請輸入正確的 Email');return;}
    setShareStatus('🔍 查詢中...');
    try {
      const snap = await getDocs(query(collection(db,'userProfiles'),where('email','==',email)));
      if (snap.empty){setShareStatus('❌ 找不到此 Email，對方需要先登入過 App');return;}
      const targetProfile = snap.docs[0].data();
      const targetUid = targetProfile.uid;
      if (targetUid===uid){setShareStatus('❌ 不能分享給自己');return;}
      if (shareEditors.includes(targetUid)||shareViewers.includes(targetUid)){setShareStatus('此帳號已在名單中');return;}

      const newEditors = newShareRole==='editor'?[...shareEditors,targetUid]:shareEditors;
      const newViewers = newShareRole==='viewer'?[...shareViewers,targetUid]:shareViewers;

      let updatedUsers = [...users];
      if (newShareRole==='editor') {
        // 優先用 nickname，再 displayName，再 email 前綴
        const memberName = targetProfile.nickname || targetProfile.displayName || email.split('@')[0];
        if (!updatedUsers.includes(memberName)) updatedUsers = [...updatedUsers, memberName];
      }

      await updateDoc(doc(db,'users',uid,'trips',tripId),{
        editors: newEditors, viewers: newViewers, ownerId: uid, users: updatedUsers,
      });
      await setDoc(doc(db,'sharedTrips',tripId),{
        ownerUid: uid, tripId, editors: newEditors, viewers: newViewers,
      });

      setShareEditors(newEditors);
      setShareViewers(newViewers);
      setUsers(updatedUsers);
      setShareEmailMap(prev=>({...prev,[targetUid]:email}));
      setNewShareEmail('');
      setShareStatus(`✅ 已新增 ${email}`);
    } catch(e) {
      console.error(e);
      setShareStatus('❌ 儲存失敗，請再試一次');
    }
  };

  const removeShareMember = async (targetUid, role) => {
    const newEditors = role==='editor'?shareEditors.filter(e=>e!==targetUid):shareEditors;
    const newViewers = role==='viewer'?shareViewers.filter(e=>e!==targetUid):shareViewers;
    try {
      await updateDoc(doc(db,'users',uid,'trips',tripId),{editors:newEditors,viewers:newViewers});
      await setDoc(doc(db,'sharedTrips',tripId),{ownerUid:uid,tripId,editors:newEditors,viewers:newViewers});
      setShareEditors(newEditors);
      setShareViewers(newViewers);
      setShareEmailMap(prev=>{const u={...prev};delete u[targetUid];return u;});
    } catch(e){console.error(e);alert('移除失敗');}
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 pb-24">
      {ConfirmUI}

      {/* 離線提示橫幅 */}
      {!isOnline && (
        <div className="sticky top-0 z-30 bg-amber-500 text-white text-sm font-bold py-2 px-4 flex items-center justify-center gap-2">
          <WifiOff size={16}/> 目前離線，變更將在恢復連線後同步
        </div>
      )}

      {/* ── Header ── */}
      <div className="sticky top-0 z-20 bg-white shadow-sm">
        <div className="p-4 flex items-center gap-3">
          <button onClick={onBack} className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors shrink-0">
            <ArrowLeft size={22}/>
          </button>

          {/* 唯讀標示 */}
          {readOnly && (
            <span className="text-xs font-bold bg-slate-100 text-slate-500 px-2 py-1 rounded-full shrink-0">👁 瀏覽</span>
          )}

          {/* 圖示切換（唯讀時不可切換） */}
          {!readOnly ? (
            <button onClick={() => setTripIconIndex(i=>(i+1)%TRIP_ICONS.length)} className="p-1.5 text-indigo-500 bg-indigo-50 hover:bg-indigo-100 rounded-lg shrink-0 transition-colors">
              <TripIcon size={22}/>
            </button>
          ) : (
            <div className="p-1.5 text-indigo-500 bg-indigo-50 rounded-lg shrink-0">
              <TripIcon size={22}/>
            </div>
          )}

          {/* 行程名稱（唯讀時不可編輯） */}
          {!readOnly && isEditingName ? (
            <input ref={tripNameRef} type="text" value={tripName} onChange={e=>setTripName(e.target.value.slice(0,15))}
              onBlur={()=>setIsEditingName(false)} onKeyDown={e=>e.key==='Enter'&&setIsEditingName(false)}
              className="font-bold text-indigo-600 bg-transparent border-b-2 border-indigo-300 outline-none flex-1 text-xl"
              maxLength={15}/>
          ) : (
            <h1 onClick={()=>!readOnly&&setIsEditingName(true)}
              className={`font-bold text-indigo-600 truncate flex-1 ${tripName.length > 10 ? 'text-base' : 'text-xl'} ${!readOnly?'cursor-text hover:opacity-80':''}`}>
              {tripName}
            </h1>
          )}

          {/* 儲存狀態 — 只顯示小圓點，hover 才顯示文字 */}
          <div className="shrink-0 relative group">
            <div className={`w-2 h-2 rounded-full transition-colors ${saveStatus==='saving'?'bg-amber-400 animate-pulse':saveStatus==='error'?'bg-red-400':'bg-green-400'}`}/>
            <div className="absolute right-0 top-4 hidden group-hover:block bg-slate-700 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-50">
              {saveStatus==='saving'?'儲存中...':saveStatus==='error'?'儲存失敗':'已同步'}
            </div>
          </div>

          {/* 分享與設定按鈕（唯讀時隱藏） */}
          {!readOnly && (
            <>
              <button onClick={()=>setIsShareOpen(true)} className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors shrink-0">
                <Share2 size={22}/>
              </button>
              <button onClick={()=>setIsSettingsOpen(true)} className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors shrink-0">
                <Settings size={22}/>
              </button>
            </>
          )}
        </div>

        {/* 日期區間顯示 */}
        {(tripStartDate || !readOnly) && (
          <div className="px-4 pb-2 flex items-center gap-2">
            {isEditingDates && !readOnly ? (
              <div className="flex items-center gap-2 flex-1">
                <input type="date" value={tripStartDate} onChange={e=>setTripStartDate(e.target.value)}
                  className="flex-1 border border-slate-200 rounded-lg px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-indigo-400 bg-slate-50"/>
                <span className="text-slate-400 text-xs">→</span>
                <input type="date" value={tripEndDate} min={tripStartDate} onChange={e=>setTripEndDate(e.target.value)}
                  className="flex-1 border border-slate-200 rounded-lg px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-indigo-400 bg-slate-50"/>
                <button onClick={()=>setIsEditingDates(false)} className="text-green-500 hover:text-green-700 p-1"><Check size={16}/></button>
              </div>
            ) : (
              <button onClick={()=>!readOnly&&setIsEditingDates(true)}
                className={`flex items-center gap-1.5 text-xs ${tripStartDate?'text-indigo-600 font-bold':'text-slate-400'} ${!readOnly?'hover:bg-indigo-50':''} px-2 py-1 rounded-lg transition-colors`}>
                <Calendar size={13}/>
                {tripStartDate && tripEndDate
                  ? `${fmtShort(tripStartDate)} – ${fmtShort(tripEndDate)}（${tripDateRange.length} 天）`
                  : tripStartDate
                  ? `${fmtShort(tripStartDate)} 起`
                  : !readOnly ? '＋ 設定旅行日期' : '未設定日期'
                }
                {!readOnly && <Edit2 size={11} className="opacity-50"/>}
              </button>
            )}
          </div>
        )}

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
            {/* 編輯切換（唯讀時隱藏） */}
            {!readOnly && (
              <button onClick={()=>{ setIsEditMode(m => { if (m) setMovingId(null); return !m; }); }} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold shadow-sm whitespace-nowrap transition-colors ${isEditMode?'bg-indigo-100 text-indigo-700 border border-indigo-200':'bg-white text-slate-600 border border-slate-200'}`}>
                {isEditMode?<><ToggleRight size={16} className="text-indigo-600"/> 編輯中</>:<><ToggleLeft size={16} className="text-slate-400"/> 瀏覽模式</>}
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Main Content ── */}
      <div className="p-4 max-w-lg mx-auto">

        {/* ══ CHECKLIST ══ */}
        {mode==='checklist' && (
          <div className="space-y-4">
            <div className="flex bg-slate-200 p-1 rounded-xl mb-4">
              <button onClick={()=>setListTab('pretrip')}  className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${listTab==='pretrip'?'bg-white shadow-sm text-indigo-600':'text-slate-500'}`}>行前清單</button>
              <button onClick={()=>setListTab('shopping')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${listTab==='shopping'?'bg-white shadow-sm text-indigo-600':'text-slate-500'}`}>各景點購物總覽</button>
            </div>

            {listTab==='pretrip' && (
              <>
                {checklist.length>0 && (
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
                {/* 新增清單（唯讀時隱藏） */}
                {!readOnly && (
                  <div className="flex gap-2 mb-6">
                    <input type="text" className="flex-1 border rounded-xl p-3 bg-white shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="新增清單項目..." value={newChecklistItem} onChange={e=>setNewChecklistItem(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addChecklistItem()}/>
                    <button onClick={addChecklistItem} className="px-4 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700"><Plus size={24}/></button>
                  </div>
                )}
                  <div className="flex-1 space-y-2 overflow-y-auto max-h-[60vh] pr-1">
                  {checklist.map(item=>(
                    <div key={item.id} className="flex items-center justify-between p-3 bg-white rounded-xl shadow-sm border border-slate-200">
                      <label className="flex items-center gap-3 flex-1 cursor-pointer">
                        <input type="checkbox" className="hidden" checked={item.checked} onChange={()=>toggleChecklist(item.id)}/>
                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${item.checked?'bg-indigo-500 border-indigo-500':'border-slate-300'}`}>
                          {item.checked&&<Check size={14} className="text-white"/>}
                        </div>
                        <span className={`text-slate-700 ${item.checked?'line-through opacity-50':''}`}>{item.text}</span>
                      </label>
                      {!readOnly && <button onClick={()=>deleteChecklistItem(item.id)} className="p-2 text-slate-400 hover:text-red-500"><Trash2 size={18}/></button>}
                    </div>
                  ))}
                  {checklist.length===0&&<div className="text-center py-10 text-slate-400 flex flex-col items-center gap-2"><ListTodo size={48} className="opacity-20"/><p>目前沒有清單項目</p></div>}
                  </div>
              </>
            )}

            {listTab==='shopping' && (
              <div className="space-y-4">
                {!readOnly && (
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
                      <button onClick={addGlobalShop} disabled={!globalShopId||!globalNewShop.trim()} className="px-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"><Plus size={20}/></button>
                    </div>
                  </div>
                )}
                {(()=>{
                  const shopItems=itinerary.filter(i=>i.shoppingList&&i.shoppingList.length>0);
                  let checked=0,total=0;
                  shopItems.forEach(i=>{total+=i.shoppingList.length;checked+=i.shoppingList.filter(s=>s.checked).length;});
                  if(total===0)return<div className="text-center py-10 text-slate-400 flex flex-col items-center gap-2"><ShoppingBag size={48} className="opacity-20"/><p>目前沒有任何購物清單</p></div>;
                  return(
                    <>
                      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 mb-4">
                        <div className="flex justify-between text-xs font-bold text-slate-500 mb-2"><span>購買進度</span><span>{checked}/{total}({Math.round(checked/total*100)}%)</span></div>
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
                                {!readOnly&&<button onClick={()=>delGlobalShop(item.id,s.id)} className="p-1 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={16}/></button>}
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

        {/* ══ ITINERARY ══ */}
        {mode==='itinerary' && (
          <div className="space-y-6">

            {/* ── 彈性待辦區塊 ── */}
            {(!readOnly || flexTodos.length > 0) && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl overflow-hidden">
                <button
                  onClick={()=>setFlexCollapsed(v=>!v)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-amber-100 transition-colors"
                >
                  <div className="flex items-center gap-2 font-bold text-amber-800 text-sm">
                    <Zap size={16} className="text-amber-500"/>
                    彈性待辦
                    <span className="text-xs bg-amber-200 text-amber-700 px-1.5 py-0.5 rounded-full">{flexTodos.filter(t=>!t.checked).length} 項</span>
                  </div>
                  {flexCollapsed ? <ChevronDown size={16} className="text-amber-500"/> : <ChevronUp size={16} className="text-amber-500"/>}
                </button>
                {!flexCollapsed && (
                  <div className="px-4 pb-4 space-y-2">
                    {flexTodos.map(todo=>(
                      <div key={todo.id} className={`bg-white border rounded-xl p-3 flex gap-3 items-start transition-colors ${todo.checked?'border-slate-100 opacity-60':'border-amber-100'}`}>
                        <button onClick={()=>setFlexTodos(p=>p.map(t=>t.id===todo.id?{...t,checked:!t.checked}:t))}
                          className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${todo.checked?'bg-amber-400 border-amber-400':'border-amber-300'}`}>
                          {todo.checked&&<Check size={11} className="text-white"/>}
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className={`font-bold text-sm ${todo.checked?'line-through text-slate-400':'text-slate-800'}`}>{todo.title}</div>
                          {todo.notes&&<div className="text-xs text-slate-500 mt-0.5">{todo.notes}</div>}
                        </div>
                        {!readOnly && (
                          <div className="flex gap-1 shrink-0">
                            {/* 移入行程 */}
                            <select
                              className="text-xs border border-indigo-200 rounded-lg px-1.5 py-1 bg-indigo-50 text-indigo-700 outline-none max-w-[90px]"
                              defaultValue=""
                              onChange={e=>{
                                if (!e.target.value) return;
                                const date = e.target.value;
                                setItinerary(prev=>[...prev,{id:crypto.randomUUID(),title:todo.title,notes:todo.notes||'',date,time:'',location:'',transport:'',transportSegments:[],shoppingList:[],tickets:'',lastEditedBy:currentUserName||''}]);
                                setFlexTodos(p=>p.filter(t=>t.id!==todo.id));
                              }}
                            >
                              <option value="">移入行程...</option>
                              {tripDateRange.length > 0
                                ? tripDateRange.map((d,i)=>{const dt=new Date(d);return<option key={d} value={d}>第{i+1}天 {dt.getMonth()+1}/{dt.getDate()}</option>;})
                                : [...new Set(itinerary.map(i=>i.date))].filter(Boolean).sort().map(d=><option key={d} value={d}>{fmtDate(d)}</option>)
                              }
                            </select>
                            <button onClick={()=>setFlexTodos(p=>p.filter(t=>t.id!==todo.id))} className="p-1 text-slate-400 hover:text-red-500"><X size={14}/></button>
                          </div>
                        )}
                      </div>
                    ))}
                    {flexTodos.length===0&&<div className="text-xs text-amber-600 py-1 text-center">目前沒有彈性待辦，點下方新增</div>}
                    {!readOnly && (
                      <div className="flex gap-2 mt-1">
                        <input
                          type="text" placeholder="新增彈性待辦（如：超市採購）" maxLength={30}
                          className="flex-1 border border-amber-200 rounded-xl px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-amber-300"
                          onKeyDown={e=>{
                            if(e.key==='Enter'&&e.target.value.trim()){
                              setFlexTodos(p=>[...p,{id:crypto.randomUUID(),title:e.target.value.trim(),notes:'',checked:false}]);
                              e.target.value='';
                            }
                          }}
                        />
                        <span className="text-xs text-amber-500 self-center shrink-0">Enter 新增</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-slate-500">{isEditMode?'可修改與調整行程順序（可跨天）':'快速瀏覽行程與導航'}</span>
              {isEditMode&&<button onClick={sortByTime} className="text-xs text-indigo-600 font-bold px-3 py-1.5 bg-indigo-50 rounded-full hover:bg-indigo-100 shadow-sm">依時間排序</button>}
            </div>

            {itinerary.length===0&&(
              <div className="text-center py-16 text-slate-400 flex flex-col items-center gap-3">
                <MapPin size={48} className="opacity-20"/>
                <p className="font-medium">還沒有行程</p>
                {!readOnly&&<><p className="text-xs">切換到「編輯中」模式，然後點下方按鈕新增第一站</p>{!isEditMode&&<button onClick={()=>setIsEditMode(true)} className="mt-2 px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl">開始編輯行程</button>}</>}
              </div>
            )}

            {(()=>{
              const byDate=itinerary.reduce((acc,i)=>{const d=i.date||'未定日期';(acc[d]=acc[d]||[]).push(i);return acc;},{});
              const sortedDates = Object.keys(byDate).sort();
              const firstDate = sortedDates[0];
              const lastDate = sortedDates[sortedDates.length-1];
              // 找到當天的住宿設定
              const getAccom = (dateStr) => {
                // 完全匹配優先，再找最近一筆
                const exact = accommodations.find(a=>a.date===dateStr);
                if(exact) return exact;
                const before = accommodations.filter(a=>a.date<=dateStr).sort((a,b)=>b.date.localeCompare(a.date));
                return before[0]||null;
              };
              return sortedDates.map(dateStr=>{
                const accom = getAccom(dateStr);
                const isFirst = dateStr===firstDate;
                const isLast = dateStr===lastDate;
                return (
                <div id={`date-${dateStr}`} key={dateStr} className="scroll-mt-36 mb-8">
                  <div className="mb-5 flex items-center gap-3">
                    <h2 className="text-base font-bold text-indigo-800 bg-indigo-100 px-4 py-1.5 rounded-full shadow-sm border border-indigo-200">
                      {tripDayLabel(dateStr)}
                    </h2>
                    <div className="h-px bg-indigo-200 flex-1"/>
                    {/* 住宿導航按鈕 — 第一天不顯示出發處，最後一天不顯示返回 */}
                    {accom && !isFirst && (
                      <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(accom.location||accom.name)}`}
                        target="_blank" rel="noreferrer"
                        className="shrink-0 flex items-center gap-1 text-xs px-2.5 py-1.5 bg-teal-50 text-teal-700 border border-teal-200 rounded-full hover:bg-teal-100 transition-colors"
                        title={`導航回住宿：${accom.name}`}
                      >
                        <Hotel size={13}/>回住宿
                      </a>
                    )}
                  </div>

                  {isEditMode ? (
                    <div className="space-y-2">
                      {byDate[dateStr].map((item, dayIdx) => {
                        const isMoving = movingId === item.id;
                        const isTarget = movingId && movingId !== item.id;
                        const prevItem = byDate[dateStr][dayIdx - 1];
                        const timeWarn = prevItem && (item.time || '') < (prevItem.time || '');
                        return (
                          <div
                            key={item.id}
                            className={`bg-white rounded-xl shadow-sm border p-3 flex gap-3 items-center transition-all
                              ${isMoving  ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-300' : ''}
                              ${isTarget  ? 'border-dashed border-indigo-300 hover:bg-indigo-50 cursor-pointer' : ''}
                              ${timeWarn && !isMoving && !isTarget ? 'border-red-300 bg-red-50' : ''}
                              ${!isMoving && !isTarget && !timeWarn ? 'border-slate-200' : ''}
                            `}
                            onClick={() => isTarget && handleTapMove(item.id)}
                          >
                            {/* 移動按鈕 */}
                            <button
                              onClick={e => { e.stopPropagation(); setMovingId(isMoving ? null : item.id); }}
                              className={`shrink-0 w-8 h-8 flex flex-col items-center justify-center gap-0.5 rounded-lg transition-colors
                                ${isMoving ? 'bg-indigo-500 text-white' : 'text-slate-300 hover:text-indigo-500 hover:bg-indigo-50'}`}
                              title={isMoving ? '取消移動' : '點此選取，再點目標位置'}
                            >
                              <div className="w-3.5 h-0.5 bg-current rounded"/>
                              <div className="w-3.5 h-0.5 bg-current rounded"/>
                              <div className="w-3.5 h-0.5 bg-current rounded"/>
                            </button>

                            <div className="flex-1 min-w-0" onClick={e => { if (!isTarget) { e.stopPropagation(); setEditingItem({...item, transportSegments: normalizeTransportSegments(item)}); setIsOptionalOpen(false); setIsEditModalOpen(true); } }}>
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className={`font-bold text-sm ${timeWarn ? 'text-red-500' : 'text-indigo-600'}`}>{item.time}{timeWarn && ' ⚠️'}</span>
                                <span className="font-bold truncate text-slate-800">{item.title}</span>
                                {isMoving && <span className="text-xs bg-indigo-500 text-white px-1.5 py-0.5 rounded-full shrink-0">移動中</span>}
                              </div>
                              <div className="text-xs text-slate-400 truncate flex items-center gap-1">
                                <MapPin size={11}/>{item.location || '無地點'}
                                {isTarget && <span className="ml-auto text-indigo-500 font-bold">點此移到這裡 ↑</span>}
                              </div>
                            </div>

                            {!movingId && (
                              <div className="flex gap-1.5 shrink-0">
                                <button onClick={e => { e.stopPropagation(); setEditingItem({...item, transportSegments: normalizeTransportSegments(item)}); setIsOptionalOpen(false); setIsEditModalOpen(true); }} className="p-2 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg"><Edit2 size={16}/></button>
                                <button onClick={e => { e.stopPropagation(); deleteItineraryItem(item.id); }} className="p-2 text-red-500 bg-red-50 hover:bg-red-100 rounded-lg"><Trash2 size={16}/></button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="relative border-l-2 border-indigo-200 ml-4 space-y-8 pb-4">
                      {byDate[dateStr].map((item,dayIdx)=>{
                        const next=byDate[dateStr][dayIdx+1];
                        return(
                          <div key={item.id} className="relative pl-6">
                            <div className="absolute -left-[9px] top-1 w-4 h-4 bg-indigo-500 rounded-full border-4 border-slate-50"/>
                            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
                              <div className="flex items-center gap-2 text-indigo-600 font-bold mb-1"><Clock size={16}/>{item.time}</div>
                              <div className="flex justify-between items-start cursor-pointer group mb-2" onClick={()=>setExpandedItems(prev=>{const s=new Set(prev);s.has(item.id)?s.delete(item.id):s.add(item.id);return s;})}>
                                <h3 className="text-lg font-bold group-hover:text-indigo-600 pr-2">{item.title}</h3>
                                {expandedItems.has(item.id)?<ChevronUp size={20} className="text-slate-400 shrink-0 mt-0.5"/>:<ChevronDown size={20} className="text-slate-400 shrink-0 mt-0.5"/>}
                              </div>
                              {item.lastEditedBy && (
                                <div className="text-xs text-slate-400 mb-2">✏️ 最後編輯：{item.lastEditedBy}</div>
                              )}
                              {item.location&&(
                                <div className="flex items-start gap-2 text-slate-600 mb-2 text-sm">
                                  <MapPin size={16} className="mt-0.5 shrink-0 text-red-500"/>
                                  <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.location)}`} target="_blank" rel="noreferrer" className="hover:underline text-blue-600">{item.location}</a>
                                </div>
                              )}
                              <div className="flex flex-wrap gap-2 mb-3">
                                {item.website&&<a href={item.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100"><Globe size={12}/>官網</a>}
                                {item.shoppingList?.length>0&&<span className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-pink-50 text-pink-600 rounded-full"><ShoppingBag size={12}/>購物清單({item.shoppingList.length})</span>}
                                {item.tickets&&<span className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-amber-50 text-amber-600 rounded-full"><Ticket size={12}/>門票</span>}
                              </div>
                              {expandedItems.has(item.id)&&(
                                <div className="mt-3 pt-3 border-t border-slate-100 space-y-3 mb-3">
                                  {(item.notes||item.hours)&&(
                                    <div className="bg-slate-50 p-3 rounded-lg text-sm space-y-1">
                                      {item.hours&&<p className="flex items-center gap-2"><Clock size={14} className="text-slate-400"/>{item.hours}</p>}
                                      {item.notes&&<p className="text-slate-700">{item.notes}</p>}
                                    </div>
                                  )}
                                  {item.shoppingList?.length>0&&(
                                    <div className="bg-pink-50/50 p-3 rounded-lg text-sm border border-pink-100">
                                      <div className="font-bold text-pink-700 flex items-center gap-1 mb-2"><ShoppingBag size={14}/>預計購買項目</div>
                                      {item.shoppingList.map(s=>(
                                        <div key={s.id} className={`flex items-start gap-2 mb-1 ${s.checked?'opacity-50 line-through text-slate-500':'text-pink-800'}`}>
                                          <Check size={14} className={`mt-0.5 shrink-0 ${s.checked?'text-pink-500':'text-transparent border border-pink-300 rounded-sm'}`}/>{s.text}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {item.tickets&&(
                                    <div className="bg-amber-50/50 p-3 rounded-lg text-sm border border-amber-100">
                                      <div className="font-bold text-amber-700 flex items-center gap-1 mb-1"><Ticket size={14}/>門票資訊</div>
                                      <div className="text-amber-800 whitespace-pre-wrap">{item.tickets}</div>
                                    </div>
                                  )}
                                </div>
                              )}
                              <div className="flex gap-2 border-t pt-3">
                                {/* 記一筆（唯讀時隱藏） */}
                                {!readOnly&&<button onClick={()=>setAddingExpenseFor(item)} className="flex-1 flex justify-center items-center gap-1 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200"><DollarSign size={16}/>記一筆</button>}
                                {item.location&&(
                                  <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(item.location)}`} target="_blank" rel="noreferrer" className="flex-1 flex justify-center items-center gap-1 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 shadow-sm"><Navigation size={16}/>導航到這裡</a>
                                )}
                              </div>
                            </div>
                            {item.transport&&(()=>{
                              const segments = normalizeTransportSegments(item);
                              const isExpanded = expandedTransport.has(item.id);
                              const summary = segments.length > 0 ? segments.map(s=>s.mode).filter(Boolean).join(' → ') : item.transport;
                              return (
                                <div className="mt-4 ml-2">
                                  <button
                                    onClick={()=>setExpandedTransport(prev=>{const s=new Set(prev);s.has(item.id)?s.delete(item.id):s.add(item.id);return s;})}
                                    className="flex items-center gap-2 text-sm text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200 hover:bg-slate-200 transition-colors"
                                  >
                                    <Car size={14}/>{summary}{segments.length>1&&<span className="text-xs bg-slate-300 px-1 rounded">{segments.length}段</span>}{isExpanded?<ChevronUp size={13}/>:<ChevronDown size={13}/>}
                                  </button>
                                  {isExpanded && segments.length > 0 && (
                                    <div className="mt-2 ml-2 space-y-2">
                                      {segments.map((seg,si)=>(
                                        <div key={seg.id} className="bg-white border border-slate-200 rounded-xl p-3 text-xs space-y-1">
                                          <div className="font-bold text-slate-700 flex items-center gap-1 justify-between">
                                            <span className="flex items-center gap-1"><MoveRight size={12} className="text-indigo-400"/>第{si+1}段：{seg.mode||'未填'}</span>
                                            {!readOnly && seg.price && (
                                              <button
                                                onClick={()=>setAddingExpenseFor({
                                                  id: item.id,
                                                  title: `${item.title} 交通（${seg.mode||''}）`,
                                                  _prefill: { description: `${seg.mode||'交通'}`, amount: parseFloat(seg.price)||0, currency: baseCurrency }
                                                })}
                                                className="flex items-center gap-1 text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full hover:bg-emerald-100"
                                              >
                                                <DollarSign size={11}/>記帳
                                              </button>
                                            )}
                                          </div>
                                          {seg.departure&&<div className="text-slate-500 flex gap-3"><span>🕐 發車 {seg.departure}</span></div>}
                                          {seg.duration&&<div className="text-slate-500">⏱ 預估 {seg.duration}</div>}
                                          {seg.price&&<div className="text-slate-500">💴 {seg.price}</div>}
                                          {seg.url&&<a href={seg.url} target="_blank" rel="noreferrer" className="text-indigo-500 underline">🔗 購票連結</a>}
                                          {seg.needTicket&&<div className="text-amber-600 font-bold">⚠️ 需提前購票</div>}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
              })
            })()}

            {/* 新增行程景點（唯讀時隱藏） */}
            {isEditMode&&!readOnly&&(
              <button onClick={()=>{
                const dates=[...new Set(itinerary.map(i=>i.date))].filter(Boolean).sort();
                const last=dates.length>0?dates[dates.length-1]:tripStartDate||new Date().toISOString().split('T')[0];
                setEditingItem({date:last,title:'',time:'12:00',location:'',transport:'',notes:'',website:'',hours:'',shoppingList:[],tickets:'',transportSegments:[]});
                setIsOptionalOpen(false);
                setIsEditModalOpen(true);
              }} className="w-full py-3 border-2 border-dashed border-indigo-300 text-indigo-600 font-bold rounded-xl flex justify-center items-center gap-2 hover:bg-indigo-50 transition-colors">
                <Plus size={20}/> 新增行程景點
              </button>
            )}
          </div>
        )}

        {/* ══ FINANCE ══ */}
        {mode==='finance' && (
          <div className="space-y-6">
            <div className="bg-indigo-600 rounded-2xl p-5 text-white shadow-md">
              <div className="text-indigo-200 text-sm mb-1">總花費 ({baseCurrency})</div>
              <div className="text-3xl font-bold mb-4 flex items-center gap-1"><DollarSign size={28}/>{Math.round(financeSummary.total).toLocaleString()}</div>
              <div className="space-y-3 mt-4 border-t border-indigo-500 pt-4">
                <div className="text-sm font-medium mb-2 flex items-center gap-1"><PieChart size={16}/>個人分攤概況</div>
                {users.map(u=>{
                  const s=financeSummary.userStats[u];
                  if(!s)return null;
                  const bal=s.paid-s.consumed;
                  return(
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

            {settlement.length>0&&(
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
            {settlement.length===0&&expenses.length>0&&(
              <div className="text-center py-3 bg-green-50 rounded-2xl border border-green-100">
                <p className="text-green-600 font-bold text-sm">🎉 所有人已結清，無需轉帳！</p>
              </div>
            )}

            {/* 記一筆 & 匯出（唯讀時隱藏新增按鈕） */}
            <div className="flex gap-2">
              {!readOnly&&<button onClick={()=>setAddingExpenseFor({title:'一般花費'})} className="flex-1 py-3 bg-white border border-slate-200 text-slate-800 font-bold rounded-xl flex justify-center items-center gap-2 shadow-sm hover:bg-slate-50"><Plus size={18}/>記一筆</button>}
              <button onClick={exportCSV} className="flex-1 py-3 bg-white border border-slate-200 text-slate-800 font-bold rounded-xl flex justify-center items-center gap-2 shadow-sm hover:bg-slate-50"><Download size={18}/>匯出 CSV</button>
            </div>

            <div className="space-y-3">
              <h3 className="font-bold text-slate-700 ml-1">帳務明細</h3>
              {expenses.length===0&&<div className="text-center text-slate-400 py-4">尚無記帳紀錄</div>}
              {expenses.map(exp=>{
                const rel=itinerary.find(i=>i.id===exp.itineraryId);
                return(
                  <div key={exp.id} onClick={()=>!readOnly&&setEditingExpense(exp)} className={`bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center transition-all group ${!readOnly?'cursor-pointer hover:border-indigo-300 hover:shadow-md':''}`}>
                    <div className="flex-1 min-w-0 pr-3">
                      <div className="font-bold text-slate-800 group-hover:text-indigo-700 flex items-center gap-2 truncate">
                        {exp.description}{!readOnly&&<Edit2 size={14} className="opacity-0 group-hover:opacity-100 text-indigo-400 shrink-0"/>}
                      </div>
                      <div className="text-xs mt-1 flex flex-wrap gap-2 items-center">
                        <span className="bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded flex items-center gap-0.5"><Tag size={10}/>{exp.category||'其他'}</span>
                        <span className="text-slate-500">付: {exp.splitMode==='aa'?'AA各付':(exp.paidBy||'')}</span>
                        <span className="text-slate-500">分: {exp.splitMode==='custom'?'自訂':exp.splitMode==='aa'?`AA×${(exp.aaSplitAmong||exp.splitAmong||[]).length}`:(exp.splitAmong||[]).join(',')}</span>
                        {rel&&<span className="text-indigo-500 truncate">📍 {rel.title}</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-bold text-red-500">{exp.amount} {exp.currency}</div>
                      {!readOnly&&<button onClick={e=>{e.stopPropagation();deleteExpense(exp.id);}} className="text-xs text-slate-400 hover:text-red-500 mt-1 px-2 py-1 rounded hover:bg-red-50 transition-colors">刪除</button>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Toast ── */}
      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-slate-800 text-white text-sm font-medium px-4 py-2 rounded-full shadow-lg animate-fade-in pointer-events-none">
          {toast}
        </div>
      )}

      {/* ── 回到頂部按鈕 ── */}
      {showScrollTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-6 right-6 z-40 bg-indigo-600 text-white p-3 rounded-full shadow-lg hover:bg-indigo-700 transition-all"
          title="回到頂部"
        >
          <ChevronUp size={22}/>
        </button>
      )}

      {/* ══ SETTINGS MODAL ══ */}
      {isSettingsOpen&&(
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
                    {isUsersLocked?<><Lock size={12}/>已鎖定</>:<><Unlock size={12}/>編輯中</>}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {users.map((u, idx)=>(
                    <div key={u} className={`border text-slate-700 px-3 py-1.5 rounded-full text-sm font-medium flex items-center gap-2 ${idx===0?'bg-indigo-50 border-indigo-200':'bg-slate-50 border-slate-200'}`}>
                      {idx===0&&<span title="建立者" className="text-amber-500 text-xs">👑</span>}
                      {editingUserId===u?(
                        <div className="flex items-center gap-1">
                          <input autoFocus type="text" className="w-20 border-b border-indigo-400 bg-transparent outline-none text-center px-1" value={editUserValue} onChange={e=>setEditUserValue(e.target.value)} onKeyDown={e=>e.key==='Enter'&&saveEditedUser(u)}/>
                          <button onClick={()=>saveEditedUser(u)} className="text-green-600"><Save size={14}/></button>
                          <button onClick={()=>setEditingUserId(null)} className="text-slate-400"><X size={14}/></button>
                        </div>
                      ):(
                        <>
                          {u}
                          {!isUsersLocked&&(
                            <div className="flex items-center gap-1">
                              <button onClick={()=>{setEditingUserId(u);setEditUserValue(u);}} className="text-slate-300 hover:text-indigo-500"><Edit2 size={14}/></button>
                              {/* 刪除按鈕：建立者不可刪，只有 owner 可刪，至少留一人 */}
                              {idx>0&&isOwner&&users.length>1&&(
                                <button onClick={()=>removeUser(u,idx)} className="text-slate-300 hover:text-red-500"><X size={14}/></button>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
                {!isUsersLocked&&(
                  <div className="flex gap-2">
                    <input type="text" value={newUser} onChange={e=>setNewUser(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addUser()} placeholder="輸入新成員名字..." className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-400"/>
                    <button onClick={addUser} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-700">新增</button>
                  </div>
                )}
                {isUsersLocked&&<p className="text-xs text-slate-400">解鎖後可新增或刪除成員。刪除時系統將自動重新分配花費。{!isOwner?' （只有行程擁有者可刪除成員）':''}</p>}
              </div>

              {/* Categories */}
              <div className="space-y-3">
                <div className="border-b pb-2"><h3 className="font-bold text-slate-700 flex items-center gap-1.5"><Tag size={16} className="text-indigo-500"/>記帳分類管理</h3></div>
                <div className="flex flex-wrap gap-2">
                  {categories.map(c=>(
                    <div key={c} className="bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-md text-xs font-bold flex items-center gap-1">
                      {editingCatId===c?(
                        <div className="flex items-center gap-1">
                          <input autoFocus type="text" className="w-16 border-b border-indigo-400 bg-transparent outline-none text-center" value={editCatValue} onChange={e=>setEditCatValue(e.target.value)} onKeyDown={e=>e.key==='Enter'&&saveEditedCat(c)}/>
                          <button onClick={()=>saveEditedCat(c)} className="text-green-600"><Save size={12}/></button>
                          <button onClick={()=>setEditingCatId(null)} className="text-slate-400"><X size={12}/></button>
                        </div>
                      ):(
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

              {/* Rates */}
              <div className="space-y-3">
                <div className="border-b pb-2 flex justify-between items-center">
                  <h3 className="font-bold text-slate-700 flex items-center gap-1.5"><Globe size={16} className="text-indigo-500"/>匯率設定</h3>
                  <span className="text-xs text-slate-400">基準: {baseCurrency}</span>
                </div>
                <p className="text-xs text-slate-400">設定各幣別兌換比率。範例：1 JPY = 0.21 TWD，則輸入 0.21</p>
                <div className="space-y-2">
                  {Object.entries(rates).map(([c,r])=>(
                    <div key={c} className={`flex justify-between items-center p-2.5 rounded-lg text-sm border ${c===baseCurrency?'bg-indigo-50 border-indigo-200':'bg-slate-50 border-slate-100'}`}>
                      <div className="flex items-center gap-2 shrink-0">
                        {c===baseCurrency&&<Star size={12} className="text-amber-400 fill-amber-400"/>}
                        <span className={`font-bold ${c===baseCurrency?'text-indigo-700':'text-slate-600'}`}>1 {c} =</span>
                      </div>
                      <div className="flex items-center gap-1 flex-1 mx-2">
                        <input type="number" step="0.0001" className={`w-20 border-b bg-transparent text-right outline-none focus:border-indigo-400 ${c===baseCurrency?'border-indigo-200 text-indigo-700 font-bold':'border-slate-300'}`} value={r} onChange={e=>updateRate(c,e.target.value)} disabled={c===baseCurrency}/>
                        <span className="text-slate-500 text-xs font-medium ml-1">{baseCurrency}</span>
                      </div>
                      <div className="flex items-center gap-1 w-10 justify-end">
                        {c!==baseCurrency&&<>
                          <button onClick={()=>setBaseCurrency(c)} className="text-slate-300 hover:text-amber-500" title="設為基準幣別"><Star size={16}/></button>
                          <button onClick={()=>removeRate(c)} className="text-slate-400 hover:text-red-500"><X size={16}/></button>
                        </>}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input type="text" value={newCurrency} onChange={e=>setNewCurrency(e.target.value.toUpperCase())} placeholder="幣別 (如: EUR)" maxLength="3" className="w-1/3 border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white outline-none uppercase"/>
                  <input type="number" step="0.001" value={newRateValue} onChange={e=>setNewRateValue(e.target.value)} placeholder={`1 幣 = ? ${baseCurrency}`} className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white outline-none"/>
                  <button onClick={addRate} className="bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-slate-300">新增</button>
                </div>
              </div>

              {/* 住宿設定 */}
              <div className="space-y-3">
                <div className="border-b pb-2">
                  <h3 className="font-bold text-slate-700 flex items-center gap-1.5"><Hotel size={16} className="text-teal-500"/>住宿設定</h3>
                </div>
                <p className="text-xs text-slate-400">設定每晚住宿地點，行程計畫頁的日期標題旁會顯示「回住宿」導航按鈕。</p>
                <div className="space-y-2">
                  {accommodations.map((accom,idx)=>(
                    <div key={idx} className="flex gap-2 items-center bg-teal-50 border border-teal-100 rounded-xl px-3 py-2">
                      <Hotel size={14} className="text-teal-500 shrink-0"/>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-teal-600 font-bold">{accom.date ? fmtDate(accom.date) : '未設定日期'} 起</div>
                        <div className="text-sm font-medium text-slate-700 truncate">{accom.name}</div>
                        {accom.location&&accom.location!==accom.name&&<div className="text-xs text-slate-400 truncate">{accom.location}</div>}
                      </div>
                      <button onClick={()=>setAccommodations(p=>p.filter((_,i)=>i!==idx))} className="text-slate-400 hover:text-red-500 shrink-0"><X size={16}/></button>
                    </div>
                  ))}
                  {accommodations.length===0&&<div className="text-xs text-slate-400 py-1">尚未設定住宿</div>}
                </div>
                {/* 新增住宿 */}
                {!showAddAccom ? (
                  <button onClick={()=>setShowAddAccom(true)} className="w-full py-2 text-sm text-teal-600 font-bold border border-dashed border-teal-300 rounded-xl hover:bg-teal-50 flex items-center justify-center gap-1">
                    <Plus size={14}/>新增住宿
                  </button>
                ) : (
                  <div className="bg-white border border-teal-200 rounded-xl p-3 space-y-2">
                    <div>
                      <label className="text-xs font-bold text-slate-500 mb-1 block">適用起始日期</label>
                      {tripDateRange.length>0?(
                        <select className="w-full border rounded-lg p-2 text-sm bg-slate-50 outline-none" value={newAccomDate} onChange={e=>setNewAccomDate(e.target.value)}>
                          <option value="">選擇日期...</option>
                          {tripDateRange.map((d,i)=>{const dt=new Date(d);return<option key={d} value={d}>第{i+1}天 {dt.getMonth()+1}/{dt.getDate()}</option>;})}
                        </select>
                      ):(
                        <input type="date" className="w-full border rounded-lg p-2 text-sm bg-slate-50" value={newAccomDate} onChange={e=>setNewAccomDate(e.target.value)}/>
                      )}
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500 mb-1 block">住宿名稱</label>
                      <input type="text" placeholder="如：京都The b飯店" className="w-full border rounded-lg p-2 text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-teal-300" value={newAccomName} onChange={e=>setNewAccomName(e.target.value)}/>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500 mb-1 block">地址（供導航用，留空則用名稱）</label>
                      <input type="text" placeholder="可貼店家名稱或地址" className="w-full border rounded-lg p-2 text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-teal-300" value={newAccomLoc} onChange={e=>setNewAccomLoc(e.target.value)}/>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button onClick={()=>{setShowAddAccom(false);setNewAccomName('');setNewAccomLoc('');setNewAccomDate('');}} className="flex-1 py-2 text-sm text-slate-500 bg-slate-100 rounded-lg hover:bg-slate-200">取消</button>
                      <button onClick={()=>{
                        if(!newAccomName.trim())return;
                        setAccommodations(p=>[...p,{date:newAccomDate,name:newAccomName.trim(),location:newAccomLoc.trim()||newAccomName.trim()}].sort((a,b)=>a.date.localeCompare(b.date)));
                        setShowAddAccom(false);setNewAccomName('');setNewAccomLoc('');setNewAccomDate('');
                      }} className="flex-1 py-2 text-sm text-white bg-teal-600 rounded-lg font-bold hover:bg-teal-700">新增</button>
                    </div>
                  </div>
                )}
              </div>

              {/* Markdown 匯入 */}
              <div className="space-y-3">
                <div className="border-b pb-2">
                  <h3 className="font-bold text-slate-700 flex items-center gap-1.5">📥 匯入行程</h3>
                </div>
                <p className="text-xs text-slate-400">從 Markdown 檔案匯入行程景點與清單，會加到現有內容後面，不會覆蓋。</p>
                <div className="flex gap-2">
                  <button onClick={() => setIsMarkdownImportOpen(true)} className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 flex items-center justify-center gap-2">
                    📋 貼上 Markdown 匯入
                  </button>
                  <button onClick={downloadSampleMarkdown} className="px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-200">
                    📄 下載範例
                  </button>
                </div>
              </div>

              {/* 版本資訊 */}
              <div className="text-center pt-2 pb-1">
                <span className="text-xs text-slate-300 font-mono">v0.6.1</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ SHARE MODAL ══ */}
      {isShareOpen&&(
        <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="sticky top-0 bg-white/95 backdrop-blur-sm p-4 border-b flex justify-between items-center z-10">
              <h2 className="font-bold text-lg flex items-center gap-2"><Share2 size={20} className="text-indigo-600"/>分享行程</h2>
              <button onClick={()=>{setIsShareOpen(false);setShareStatus('');}} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200"><X size={20}/></button>
            </div>
            <div className="p-5 space-y-6">
              <div className="space-y-3">
                <h3 className="font-bold text-slate-700 text-sm border-b pb-2">新增共享成員</h3>
                <input type="email" placeholder="輸入對方的 Gmail..." value={newShareEmail} onChange={e=>{setNewShareEmail(e.target.value);setShareStatus('');}} className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-indigo-400"/>
                <div className="flex gap-2">
                  <button onClick={()=>setNewShareRole('viewer')} className={`flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-colors ${newShareRole==='viewer'?'border-indigo-500 bg-indigo-50 text-indigo-700':'border-slate-200 text-slate-500'}`}>👁 只能查看</button>
                  <button onClick={()=>setNewShareRole('editor')} className={`flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-colors ${newShareRole==='editor'?'border-indigo-500 bg-indigo-50 text-indigo-700':'border-slate-200 text-slate-500'}`}>✏️ 可以編輯</button>
                </div>
                <button onClick={addShareMember} className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700">新增成員</button>
                {shareStatus&&<p className="text-sm text-center text-slate-600">{shareStatus}</p>}
              </div>
              {shareEditors.length>0&&(
                <div className="space-y-2">
                  <h3 className="font-bold text-slate-700 text-sm flex items-center gap-1">✏️ 可編輯（{shareEditors.length}）</h3>
                  {shareEditors.map(editorUid=>(
                    <div key={editorUid} className="flex justify-between items-center bg-indigo-50 border border-indigo-100 px-4 py-3 rounded-xl text-sm">
                      <span className="text-indigo-800 font-medium truncate flex-1">{shareEmailMap[editorUid]||editorUid}</span>
                      <button onClick={()=>removeShareMember(editorUid,'editor')} className="text-slate-400 hover:text-red-500 ml-2"><X size={16}/></button>
                    </div>
                  ))}
                </div>
              )}
              {shareViewers.length>0&&(
                <div className="space-y-2">
                  <h3 className="font-bold text-slate-700 text-sm flex items-center gap-1">👁 只能查看（{shareViewers.length}）</h3>
                  {shareViewers.map(viewerUid=>(
                    <div key={viewerUid} className="flex justify-between items-center bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-sm">
                      <span className="text-slate-700 font-medium truncate flex-1">{shareEmailMap[viewerUid]||viewerUid}</span>
                      <button onClick={()=>removeShareMember(viewerUid,'viewer')} className="text-slate-400 hover:text-red-500 ml-2"><X size={16}/></button>
                    </div>
                  ))}
                </div>
              )}
              {shareEditors.length===0&&shareViewers.length===0&&<div className="text-center py-4 text-slate-400 text-sm">尚未分享給任何人</div>}
              <p className="text-xs text-slate-400 text-center">對方需要先登入 App，才能看到被分享的行程</p>
            </div>
          </div>
        </div>
      )}

      {/* ══ EDIT ITINERARY MODAL ══ */}
      {isEditModalOpen&&editingItem&&(
        <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="sticky top-0 bg-white/95 backdrop-blur-sm p-4 border-b flex justify-between items-center z-10">
              <h2 className="font-bold text-lg">{editingItem.id?'編輯行程':'新增行程'}</h2>
              <button onClick={()=>{setIsEditModalOpen(false);setIsOptionalOpen(false);}} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200"><X size={20}/></button>
            </div>
            <div className="p-5 space-y-4">

              {/* ── 必填區 ── */}
              <div className="grid grid-cols-4 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-500 mb-1">日期</label>
                  {tripDateRange.length > 0 ? (
                    <select className="w-full border rounded-lg p-2 text-sm bg-slate-50 outline-none" value={editingItem.date||''} onChange={e=>setEditingItem({...editingItem,date:e.target.value})}>
                      <option value="">未定日期</option>
                      {tripDateRange.map((d,i)=>{const dt=new Date(d);return<option key={d} value={d}>第{i+1}天（{dt.getMonth()+1}/{dt.getDate()}）</option>;})}
                    </select>
                  ) : (
                    <input type="date" className="w-full border rounded-lg p-2 text-sm bg-slate-50" value={editingItem.date||''} onChange={e=>setEditingItem({...editingItem,date:e.target.value})}/>
                  )}
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-500 mb-1">時間</label>
                  <input type="time" className="w-full border rounded-lg p-2 text-sm bg-slate-50" value={editingItem.time||''} onChange={e=>setEditingItem({...editingItem,time:e.target.value})}/>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">景點 / 標題 <span className="text-red-400">*</span></label>
                <input type="text" className="w-full border rounded-lg p-2 text-sm bg-slate-50 focus:ring-2 focus:ring-indigo-300 outline-none" placeholder="例如：奇美博物館" value={editingItem.title||''} onChange={e=>setEditingItem({...editingItem,title:e.target.value})}/>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">地點</label>
                <div className="relative"><MapPin size={16} className="absolute left-3 top-2.5 text-slate-400"/><input type="text" className="w-full border rounded-lg p-2 pl-9 text-sm bg-slate-50 focus:ring-2 focus:ring-indigo-300 outline-none" placeholder="店家名稱或地址（可從 Google Maps 複製）" value={editingItem.location||''} onChange={e=>setEditingItem({...editingItem,location:e.target.value})}/></div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">交通方式（前往此地）</label>
                <input type="text" className="w-full border rounded-lg p-2 text-sm bg-slate-50 focus:ring-2 focus:ring-indigo-300 outline-none" placeholder="如：搭地鐵、步行" value={(editingItem.transportSegments?.[0]?.mode ?? editingItem.transport) || ''} onChange={e=>{
                  const segs = editingItem.transportSegments?.length > 0 ? [...editingItem.transportSegments] : [emptySegment()];
                  segs[0] = {...segs[0], mode: e.target.value};
                  setEditingItem({...editingItem, transportSegments: segs});
                }}/>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">備註</label>
                <textarea className="w-full border rounded-lg p-2 text-sm bg-slate-50 h-16 focus:ring-2 focus:ring-indigo-300 outline-none resize-none" placeholder="注意事項..." value={editingItem.notes||''} onChange={e=>setEditingItem({...editingItem,notes:e.target.value})}/>
              </div>

              {/* ── 選填區 ── */}
              <div>
                <button
                  onClick={()=>setIsOptionalOpen(v=>!v)}
                  className="w-full flex items-center justify-center gap-2 py-2 text-sm font-bold text-slate-500 border border-dashed border-slate-300 rounded-xl hover:bg-slate-50 transition-colors"
                >
                  {isOptionalOpen ? <><ChevronUp size={16}/>收起選填欄位</> : <><Plus size={16}/>新增更多資訊（選填）</>}
                </button>
              </div>

              {isOptionalOpen && (
                <div className="space-y-4 pt-1">

                  {/* 交通細節 — 多段 */}
                  <div className="bg-blue-50/60 rounded-xl p-3 border border-blue-100 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-blue-700 flex items-center gap-1"><Car size={14}/>交通細節</label>
                      <button onClick={()=>{const segs=editingItem.transportSegments?.length>0?[...editingItem.transportSegments]:[emptySegment()];setEditingItem({...editingItem,transportSegments:[...segs,emptySegment()]});}} className="text-xs text-indigo-600 font-bold flex items-center gap-0.5 hover:text-indigo-800"><Plus size={13}/>新增一段</button>
                    </div>
                    {(editingItem.transportSegments?.length > 0 ? editingItem.transportSegments : []).map((seg, si)=>(
                      <div key={seg.id} className="bg-white rounded-lg p-3 border border-blue-100 space-y-2">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-slate-600">第 {si+1} 段</span>
                          {si > 0 && <button onClick={()=>setEditingItem({...editingItem,transportSegments:editingItem.transportSegments.filter((_,i)=>i!==si)})} className="text-slate-400 hover:text-red-500"><X size={14}/></button>}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">交通方式</label>
                            <input type="text" className="w-full border border-blue-200 rounded-lg p-2 text-sm bg-slate-50 outline-none" placeholder="火車、巴士" value={seg.mode} onChange={e=>{const s=[...editingItem.transportSegments];s[si]={...s[si],mode:e.target.value};setEditingItem({...editingItem,transportSegments:s});}}/>
                          </div>
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">發車時間</label>
                            <input type="time" className="w-full border border-blue-200 rounded-lg p-2 text-sm bg-white outline-none" value={seg.departure} onChange={e=>{const s=[...editingItem.transportSegments];s[si]={...s[si],departure:e.target.value};setEditingItem({...editingItem,transportSegments:s});}}/>
                          </div>
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">預估時間</label>
                            <input type="text" className="w-full border border-blue-200 rounded-lg p-2 text-sm bg-white outline-none" placeholder="30分鐘" value={seg.duration} onChange={e=>{const s=[...editingItem.transportSegments];s[si]={...s[si],duration:e.target.value};setEditingItem({...editingItem,transportSegments:s});}}/>
                          </div>
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">票價</label>
                            <input type="text" className="w-full border border-blue-200 rounded-lg p-2 text-sm bg-white outline-none" placeholder="3600" value={seg.price} onChange={e=>{const s=[...editingItem.transportSegments];s[si]={...s[si],price:e.target.value};setEditingItem({...editingItem,transportSegments:s});}}/>
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">購票連結</label>
                          <input type="url" className="w-full border border-blue-200 rounded-lg p-2 text-sm bg-white outline-none" placeholder="https://" value={seg.url} onChange={e=>{const s=[...editingItem.transportSegments];s[si]={...s[si],url:e.target.value};setEditingItem({...editingItem,transportSegments:s});}}/>
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={seg.needTicket} onChange={e=>{
                            const s=[...editingItem.transportSegments];s[si]={...s[si],needTicket:e.target.checked};setEditingItem({...editingItem,transportSegments:s});
                            if(e.target.checked){const text=`購票：${editingItem.title||seg.mode||'交通'}（第${si+1}段）`;if(!checklist.some(c=>c.text===text))setChecklist(prev=>[...prev,{id:crypto.randomUUID(),text,checked:false}]);}
                          }} className="w-4 h-4 rounded accent-indigo-600"/>
                          <span className="text-xs font-bold text-blue-700">需提前購票 → 自動加行前清單</span>
                        </label>
                      </div>
                    ))}
                    {(!editingItem.transportSegments || editingItem.transportSegments.length === 0) && (
                      <button onClick={()=>setEditingItem({...editingItem,transportSegments:[emptySegment()]})} className="w-full py-2 text-sm text-indigo-600 font-bold border border-dashed border-indigo-300 rounded-lg hover:bg-indigo-50">
                        + 填入第一段交通細節
                      </button>
                    )}
                  </div>

                  {/* 營業時間 */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">營業時間</label>
                    <input type="text" className="w-full border rounded-lg p-2 text-sm bg-slate-50 focus:ring-2 focus:ring-indigo-300 outline-none" placeholder="如：10:00-22:00" value={editingItem.hours||''} onChange={e=>setEditingItem({...editingItem,hours:e.target.value})}/>
                  </div>

                  {/* 官方網站 */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">官方網站</label>
                    <input type="url" className="w-full border rounded-lg p-2 text-sm bg-slate-50 focus:ring-2 focus:ring-indigo-300 outline-none" placeholder="https://" value={editingItem.website||''} onChange={e=>setEditingItem({...editingItem,website:e.target.value})}/>
                  </div>

                  {/* 購物清單 */}
                  <div className="p-3 bg-slate-100 rounded-xl space-y-3">
                    <label className="block text-xs font-bold text-slate-700 flex items-center gap-1"><ShoppingBag size={14}/>購物清單</label>
                    {(editingItem.shoppingList||[]).map(s=>(
                      <div key={s.id} className="flex justify-between items-center bg-white border p-2 rounded-lg text-sm"><span className="truncate flex-1">{s.text}</span><button onClick={()=>delModalShop(s.id)} className="text-slate-400 hover:text-red-500 p-1"><X size={14}/></button></div>
                    ))}
                    {!(editingItem.shoppingList?.length>0)&&<div className="text-xs text-slate-400 py-1">目前無項目</div>}
                    <div className="flex gap-2">
                      <input type="text" className="flex-1 border rounded-lg px-2 py-1.5 text-sm outline-none focus:border-indigo-400" placeholder="要買什麼..." value={modalNewShop} onChange={e=>setModalNewShop(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addModalShop()}/>
                      <button onClick={addModalShop} className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold">新增</button>
                    </div>
                  </div>

                  {/* 門票 */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">門票資訊</label>
                    <input type="text" className="w-full border rounded-lg p-2 text-sm bg-slate-50 focus:ring-2 focus:ring-indigo-300 outline-none" placeholder="票價或購票狀況" value={editingItem.tickets||''} onChange={e=>setEditingItem({...editingItem,tickets:e.target.value})}/>
                  </div>

                </div>
              )}

              <div className="pt-2 pb-4">
                <button onClick={()=>saveItineraryItem(editingItem)} disabled={!editingItem.title?.trim()} className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-md hover:bg-indigo-700 disabled:opacity-40">儲存行程</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ MARKDOWN IMPORT MODAL ══ */}
      {isMarkdownImportOpen && (
        <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="sticky top-0 bg-white/95 backdrop-blur-sm p-4 border-b flex justify-between items-center z-10">
              <h2 className="font-bold text-lg">📋 匯入 Markdown 行程</h2>
              <button onClick={()=>{setIsMarkdownImportOpen(false);setMarkdownText('');setMarkdownStatus('');}} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200"><X size={20}/></button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-500">貼上 Markdown 格式的行程內容，景點與清單項目會加到現有內容的後面。</p>
              <textarea
                className="w-full h-64 border border-slate-200 rounded-xl p-3 text-xs font-mono bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                placeholder={`## 2025-05-01\n- time: 09:00\n  title: 關西國際機場\n  location: 關西國際機場\n  transport: 關空特急 Haruka\n  transport_departure: 09:30\n  transport_duration: 75分鐘\n  transport_price: 3600\n  transport_ticket: true\n\n## 行前清單\n- [ ] 換日幣`}
                value={markdownText}
                onChange={e=>setMarkdownText(e.target.value)}
              />
              {markdownStatus && <p className="text-sm text-center font-medium text-slate-700">{markdownStatus}</p>}
              <div className="flex gap-2">
                <button onClick={downloadSampleMarkdown} className="px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-200">📄 下載範例</button>
                <button onClick={handleMarkdownImport} disabled={!markdownText.trim()} className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-40">匯入</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Expense Modals */}
      {addingExpenseFor&&<ExpenseFormModal expenseItem={addingExpenseFor} users={users} rates={rates} baseCurrency={baseCurrency} categories={categories} onSave={saveExpense} onClose={()=>setAddingExpenseFor(null)}/>}
      {editingExpense&&<ExpenseFormModal key={`edit-${editingExpense.id}`} initialData={editingExpense} expenseItem={itinerary.find(i=>i.id===editingExpense.itineraryId)||{title:'一般花費'}} users={users} rates={rates} baseCurrency={baseCurrency} categories={categories} onSave={saveExpense} onClose={()=>setEditingExpense(null)}/>}
    </div>
  );
}
