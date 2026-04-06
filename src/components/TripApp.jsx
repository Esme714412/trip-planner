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
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { doc, updateDoc, serverTimestamp, setDoc, getDocs, getDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import ExpenseFormModal from './ExpenseFormModal';
import { useConfirm } from './ConfirmModal';
import {
  MapPin, Clock, Globe, ShoppingBag, Ticket, Navigation,
  Car, Plus, Edit2, Trash2, DollarSign,
  ChevronDown, ChevronUp, Check, X,
  ListTodo, Calendar, Settings,
  Star, Plane, Luggage, Camera as CameraIcon,
  ArrowLeft, ArrowRight, Share2,
  Wallet, Map, MoreHorizontal,
  Hotel, Lock, Unlock, Users,
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
};

// Firestore 不接受 undefined，遞迴清除
function cleanForFirestore(obj) {
  if (Array.isArray(obj)) return obj.map(cleanForFirestore);
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, cleanForFirestore(v)])
    );
  }
  return obj;
}

function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debouncedValue;
}

import { parseMarkdown } from '../utils/parseMarkdown';

// ─── Main Component ───────────────────────────────────────────────────────────
export default function TripApp({ uid, currentUserUid, currentUserName, tripId, initialData = MOCK_DATA, readOnly = false, onBack }) {
  const { confirm, ConfirmUI } = useConfirm();
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
  const [saveStatus,     setSaveStatus]     = useState('saved'); // 'saving' | 'saved' | 'error' | 'offline'
  const [isOnline,       setIsOnline]       = useState(navigator.onLine);
  const [isFinancePrivate,  setIsFinancePrivate]  = useState(true);
  const [checklistDragId,   setChecklistDragId]   = useState(null);
  const [movingChecklistId, setMovingChecklistId] = useState(null);
  const [showTicketSection, setShowTicketSection] = useState(true);
  const [showMemoSection,   setShowMemoSection]   = useState(true);
  const [showTodoSection,   setShowTodoSection]   = useState(true);
  const [spotModalOpen,     setSpotModalOpen]     = useState(false);
  const [spotModalData,     setSpotModalData]     = useState({name:'',location:'',note:'',url:''});
  const [newCheckType,     setNewCheckType]     = useState('item'); // 'item' | 'memo'
  // Settings modal
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isShareOpen,    setIsShareOpen]    = useState(false);
  const [isMarkdownOpen, setIsMarkdownOpen] = useState(false);
  const [markdownText,   setMarkdownText]   = useState('');
  const [markdownStatus, setMarkdownStatus] = useState('');
  // 住宿設定 form state
  const [showAddAccom,   setShowAddAccom]   = useState(false);
  const [newAccomCheckIn, setNewAccomCheckIn]  = useState('');
  const [newAccomCheckOut,setNewAccomCheckOut] = useState('');
  const [newAccomName,   setNewAccomName]   = useState('');
  const [newAccomLoc,    setNewAccomLoc]    = useState('');
  const [newAccomPrice,  setNewAccomPrice]  = useState('');
  const [newAccomCur,    setNewAccomCur]    = useState('');
  const [editingAccomIdx,setEditingAccomIdx]= useState(null); // index being edited
  // 收藏景點 form（inline states 已移至 spotModalData）
  const [addingSpotToDate,setAddingSpotToDate]= useState(null);
  const [expandedSpotId, setExpandedSpotId] = useState(null);
  const [editingSpotId,  setEditingSpotId]  = useState(null);
  const [editingSpotData,setEditingSpotData]= useState({});
  const [pendingScrollToDate, setPendingScrollToDate] = useState(null);
  // 購物總覽新增
  const [shopAddSheet,   setShopAddSheet]   = useState(null); // itinerary item id
  const [shopAddText,    setShopAddText]    = useState('');
  const shopAddRef = useRef(null);
  useEffect(() => { if (shopAddSheet) setTimeout(() => shopAddRef.current?.focus(), 80); }, [shopAddSheet]);
  // 新增景點/交通 modal
  const [addItemModal,   setAddItemModal]   = useState(null); // {type:'place'|'transport', date}
  const [addItemData,    setAddItemData]    = useState({});
  // 分享
  const [newShareEmail,  setNewShareEmail]  = useState('');
  const [newShareRole,   setNewShareRole]   = useState('viewer');
  const [shareStatus,    setShareStatus]    = useState('');
  const [shareEditors,   setShareEditors]   = useState(initialData.editors || []);
  const [shareViewers,   setShareViewers]   = useState(initialData.viewers || []);
  const [shareEmailMap,  setShareEmailMap]  = useState({}); // uid → email
  // People management
  const [isUsersLocked,  setIsUsersLocked]  = useState(true);
  const [newUser,        setNewUser]        = useState('');
  const [editingUserId,  setEditingUserId]  = useState(null);
  const [editUserValue,  setEditUserValue]  = useState('');
  // Category management
  const [newCategory,    setNewCategory]    = useState('');
  const [editingCatId,   setEditingCatId]   = useState(null);
  const [editCatValue,   setEditCatValue]   = useState('');
  // Rate management
  const [newCurrency,    setNewCurrency]    = useState('');
  const [newRateValue,   setNewRateValue]   = useState('');

  // ── User handlers ──────────────────────────────────────────────────────────
  const addUser = () => {
    if (newUser.trim() && !users.includes(newUser.trim())) { setUsers([...users, newUser.trim()]); setNewUser(''); }
  };
  const saveEditedUser = (old) => {
    const nw = editUserValue.trim();
    if (!nw||nw===old) { setEditingUserId(null); return; }
    if (users.includes(nw)) { alert('此名稱已存在！'); return; }
    setUsers(users.map(u=>u===old?nw:u));
    setExpenses(expenses.map(exp => {
      let e = {...exp};
      if (e.paidBy===old) e.paidBy=nw;
      e.splitAmong = (e.splitAmong||[]).map(u=>u===old?nw:u);
      if (e.aaSplitAmong) e.aaSplitAmong = e.aaSplitAmong.map(u=>u===old?nw:u);
      if (e.customSplit?.[old]!==undefined) { const v=e.customSplit[old]; const cs={...e.customSplit}; delete cs[old]; cs[nw]=v; e.customSplit=cs; }
      return e;
    }));
    setEditingUserId(null);
  };
  const removeUser = async (u, idx) => {
    if (idx===0) { alert('建立者不可被刪除'); return; }
    if (users.length<=1) { alert('至少需要保留一位成員'); return; }
    if (!await confirm(`刪除「${u}」？系統將重新分配其相關花費。`, '確認刪除')) return;
    const remaining = users.filter(x=>x!==u);
    setUsers(remaining);
    setExpenses(expenses.map(exp => {
      let e = {...exp};
      if (e.paidBy===u) e.paidBy=remaining[0]||'';
      if (e.splitMode==='custom'&&e.customSplit?.[u]!==undefined) {
        const amt=Number(e.customSplit[u])||0; const cs={...e.customSplit}; delete cs[u];
        if (amt>0&&cs[e.paidBy]!==undefined) cs[e.paidBy]=(Number(cs[e.paidBy])||0)+amt;
        e.customSplit=cs;
      } else { e.splitAmong=(e.splitAmong||[]).filter(x=>x!==u); }
      return e;
    }));
  };

  // ── Category handlers ───────────────────────────────────────────────────────
  const addCategory = () => {
    if (newCategory.trim()&&!categories.includes(newCategory.trim())) { setCategories([...categories,newCategory.trim()]); setNewCategory(''); }
  };
  const saveEditedCat = (old) => {
    const nw=editCatValue.trim();
    if (!nw||nw===old) { setEditingCatId(null); return; }
    setCategories(categories.map(c=>c===old?nw:c));
    setExpenses(expenses.map(e=>e.category===old?{...e,category:nw}:e));
    setEditingCatId(null);
  };
  const removeCat = (c) => setCategories(categories.filter(x=>x!==c));

  // ── Rate handlers ────────────────────────────────────────────────────────────
  const addRate    = () => { if(newCurrency.trim()&&newRateValue) { setRates({...rates,[newCurrency.trim().toUpperCase()]:parseFloat(newRateValue)}); setNewCurrency(''); setNewRateValue(''); } };
  const updateRate = (c,v) => { if(v) setRates({...rates,[c]:parseFloat(v)}); };
  const removeRate = async (c) => {
    if (c===baseCurrency) { alert('基準幣別不可刪除'); return; }
    if (await confirm(`確定刪除幣別 ${c}？`, '確認刪除')) { const r={...rates}; delete r[c]; setRates(r); }
  };
  // 編輯模式展開的卡片 id
  const [editExpandedId, setEditExpandedId] = useState(null);
  // 點選移動
  const [movingItemId,   setMovingItemId]   = useState(null);
  // 各天 section 的 ref，用於快速捲動
  const dayRefs = React.useRef({});
  const wasOffline = React.useRef(false);
  const itineraryScrollRef = React.useRef(null);
  // 卡片詳情 / 編輯 Sheet
  const [detailSheet,    setDetailSheet]    = useState(null);
  const [detailData,     setDetailData]     = useState({});
  // FAB 展開狀態
  const [fabOpen,        setFabOpen]        = useState(false);

  const TripIcon = TRIP_ICONS[tripIconIndex % TRIP_ICONS.length];

  // ── Firebase payload + debounce save ─────────────────────────────────────
  const payload = useMemo(() => ({
    name: tripName, iconIndex: tripIconIndex,
    tripStartDate, tripEndDate,
    users, rates, baseCurrency, categories,
    checklist, itinerary, expenses, accommodations, savedSpots,
    editors: shareEditors, viewers: shareViewers,
  }), [tripName, tripIconIndex, tripStartDate, tripEndDate, users, rates, baseCurrency, categories, checklist, itinerary, expenses, accommodations, savedSpots, shareEditors, shareViewers]);

  const debouncedPayload = useDebounce(payload, 1200);
  const isFirstSave = useRef(true);
  const lastLocalSaveTime = useRef(0);
  const prevSavedPayload = useRef(null);

  useEffect(() => {
    if (isFirstSave.current) {
      isFirstSave.current = false;
      prevSavedPayload.current = debouncedPayload;
      return;
    }
    if (readOnly || !uid || !tripId) return;
    if (!isOnline) { setSaveStatus('offline'); return; }

    // 只寫有改動的欄位（merge mode）
    const prev = prevSavedPayload.current || {};
    const KEYS = ['name','iconIndex','tripStartDate','tripEndDate','users','rates','baseCurrency',
      'categories','checklist','itinerary','expenses','accommodations','savedSpots','editors','viewers'];
    const changes = {};
    for (const k of KEYS) {
      if (JSON.stringify(prev[k]) !== JSON.stringify(debouncedPayload[k])) {
        changes[k] = debouncedPayload[k];
      }
    }
    if (Object.keys(changes).length === 0) return; // 沒有實際改動，跳過

    prevSavedPayload.current = debouncedPayload;
    setSaveStatus('saving');
    updateDoc(
      doc(db, 'users', uid, 'trips', tripId),
      cleanForFirestore({ ...changes, updatedAt: serverTimestamp() })
    ).then(() => setSaveStatus('saved')).catch(() => setSaveStatus('error'));
  }, [debouncedPayload, uid, tripId, readOnly, isOnline]);

  // onSnapshot — 全欄位即時同步（3秒保護視窗避免覆蓋本地修改）
  useEffect(() => {
    if (!uid || !tripId) return;
    const unsub = onSnapshot(doc(db, 'users', uid, 'trips', tripId), (snap) => {
      if (!snap.exists()) return;
      if (Date.now() - lastLocalSaveTime.current < 3000) return;
      const d = snap.data();
      // 只更新遠端有、且本地沒有正在編輯的欄位
      if (d.itinerary      !== undefined) setItinerary(d.itinerary);
      if (d.checklist      !== undefined) setChecklist(d.checklist);
      if (d.expenses       !== undefined) setExpenses(d.expenses);
      if (d.accommodations !== undefined) setAccommodations(d.accommodations);
      if (d.savedSpots     !== undefined) setSavedSpots(d.savedSpots);
      if (d.users          !== undefined) setUsers(d.users);
      if (d.rates          !== undefined) setRates(d.rates);
      if (d.categories     !== undefined) setCategories(d.categories);
    });
    return () => unsub();
  }, [uid, tripId]);

  // ─── Date helpers ────────────────────────────────────────────────────────────
  const fmtDate = (d) => {
    if (!d) return '未定日期';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return d;
    return `${dt.getMonth()+1}/${dt.getDate()}${'日一二三四五六'[dt.getDay()]}`;
  };
  const fmtShort = (d) => {
    if (!d) return '';
    const dt = new Date(d);
    return `${dt.getMonth()+1}/${dt.getDate()}`;
  };
  const tripDateRange = useMemo(() => getDatesInRange(tripStartDate, tripEndDate), [tripStartDate, tripEndDate]);
  const sortedDates   = useMemo(() => [...new Set(itinerary.map(i => i.date || '未定日期'))].sort(), [itinerary]);
  const currentDate   = sortedDates[selectedDay] || '';

  // 收藏景點加入行程後，等 sortedDates 更新再跳到正確的天
  useEffect(() => {
    if (!pendingScrollToDate) return;
    const idx = sortedDates.indexOf(pendingScrollToDate);
    if (idx >= 0) {
      setSelectedDay(idx);
      setPendingScrollToDate(null);
    }
  }, [sortedDates, pendingScrollToDate]);

  // ──────────────────────────────────────────────────────────────────────
  const convertedExpenses = useMemo(() => expenses.map(exp => {
    const expRate  = rates[exp.currency]  || 1;
    const baseRate = rates[baseCurrency] || 1;
    const baseAmount = (exp.amount * expRate) / baseRate;
    return { ...exp, baseAmount, rateUsed: expRate / baseRate };
  }), [expenses, rates, baseCurrency]);

  const financeSummary = useMemo(() => {
    let total = 0;
    const userStats = users.reduce((acc, u) => ({ ...acc, [u]: { paid: 0, consumed: 0 } }), {});
    convertedExpenses.forEach(exp => {
      if (exp.splitMode === 'aa') {
        const perPerson = exp.baseAmount;
        (exp.aaSplitAmong || exp.splitAmong || []).forEach(u => {
          if (userStats[u]) { userStats[u].paid += perPerson; userStats[u].consumed += perPerson; }
        });
        total += perPerson * (exp.aaSplitAmong || exp.splitAmong || []).length;
      } else {
        total += exp.baseAmount;
        if (userStats[exp.paidBy]) userStats[exp.paidBy].paid += exp.baseAmount;
        if (exp.splitMode === 'custom' && exp.customSplit) {
          Object.entries(exp.customSplit).forEach(([u, amt]) => {
            if (userStats[u]) userStats[u].consumed += Number(amt) * exp.rateUsed;
          });
        } else {
          const cnt = exp.splitAmong?.length || 0;
          if (cnt > 0) {
            const pp = exp.baseAmount / cnt;
            (exp.splitAmong || []).forEach(u => { if (userStats[u]) userStats[u].consumed += pp; });
          }
        }
      }
    });
    return { total, userStats };
  }, [convertedExpenses, users]);

  const settlement = useMemo(() => calcSettlement(financeSummary.userStats), [financeSummary]);

    const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2000); };

  const openAddItem = (type, date) => {
    setAddItemData(type === 'transport'
      ? { type:'transport', date, time:'', transportMode:'', from:'', to:'', title:'', duration:'', price:'', priceCurrency:baseCurrency, url:'', needTicket:false, ticketDeadline:'', notes:'' }
      : { type:'place', date, time:'', title:'', location:'', notes:'', website:'', hours:'', tickets:'', shoppingList:[] }
    );
    setAddItemModal({ type, date });
  };

  const saveAddItem = () => {
    if (!addItemData.title?.trim() && addItemData.type !== 'transport') return;
    if (addItemData.type === 'transport' && !addItemData.transportMode?.trim()) return;
    const newId = crypto.randomUUID();
    const newItem = cleanForFirestore({
      ...addItemData,
      id: newId,
      lastEditedBy: currentUserName || '',
      lastEditedAt: new Date().toISOString(),
    });
    setItinerary(prev => [...prev, newItem]);
    // needTicket → 自動加購票提醒到行前清單
    if (addItemData.type === 'transport' && addItemData.needTicket) {
      const label = [addItemData.transportMode, addItemData.from && addItemData.to ? `${addItemData.from}→${addItemData.to}` : ''].filter(Boolean).join(' ');
      setChecklist(prev => [...prev, cleanForFirestore({
        id: crypto.randomUUID(),
        type: 'ticket',
        text: `購票：${label || '交通票'}`,
        checked: false,
        itineraryId: newId,
        ticketDeadline: addItemData.ticketDeadline || '',
        ticketMode: addItemData.transportMode || '',
        ticketDest: addItemData.to || '',
      })]);
    }
    setAddItemModal(null);
    showToast('已新增 ✓');
  };
  const toggleExpanded = (id) => setExpandedItems(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  // 載入共享成員 email
  useEffect(() => {
    const allUids = [...(initialData.editors||[]), ...(initialData.viewers||[])];
    if (!allUids.length) return;
    Promise.all(allUids.map(uid => getDoc(doc(db,'userProfiles',uid)))).then(snaps => {
      const map = {};
      snaps.forEach(s => { if(s.exists()) map[s.id] = s.data().email || s.id; });
      setShareEmailMap(map);
    }).catch(()=>{});
  }, []);

  const addShareMember = async () => {
    if (!newShareEmail.trim()) return;
    setShareStatus('查詢中...');
    try {
      const snap = await getDocs(query(collection(db,'userProfiles'), where('email','==',newShareEmail.trim())));
      if (snap.empty) { setShareStatus('找不到此帳號'); return; }
      const profile = snap.docs[0].data();
      const targetUid = snap.docs[0].id;
      const newEditors = newShareRole==='editor' ? [...new Set([...shareEditors, targetUid])] : shareEditors;
      const newViewers = newShareRole==='viewer' ? [...new Set([...shareViewers, targetUid])] : shareViewers;
      setShareEditors(newEditors); setShareViewers(newViewers);
      setShareEmailMap(prev => ({...prev, [targetUid]: newShareEmail.trim()}));
      // 編輯者自動加入參與人員
      if (newShareRole === 'editor') {
        const memberName = profile.nickname || profile.displayName || newShareEmail.trim().split('@')[0];
        setUsers(prev => prev.includes(memberName) ? prev : [...prev, memberName]);
      }
      await updateDoc(doc(db,'users',uid,'trips',tripId),{editors:newEditors,viewers:newViewers});
      await setDoc(doc(db,'sharedTrips',tripId),{ownerUid:uid,tripId,editors:newEditors,viewers:newViewers});
      setShareStatus('✅ 已新增成員'); setNewShareEmail('');
    } catch { setShareStatus('發生錯誤，請重試'); }
  };

  // Markdown 匯入
  const handleMarkdownImport = () => {
    if (!markdownText.trim()) return;
    const { itineraryItems, checklistItems, accommodationItems, savedSpotItems } = parseMarkdown(markdownText, tripStartDate);
    setItinerary(prev => [...prev, ...itineraryItems]);
    setChecklist(prev => [...prev, ...checklistItems]);
    setAccommodations(prev => [...prev, ...accommodationItems]);
    setSavedSpots(prev => [...prev, ...savedSpotItems]);
    setMarkdownStatus(`✅ 匯入 ${itineraryItems.length} 個行程、${checklistItems.length} 個清單項目、${accommodationItems.length} 筆住宿、${savedSpotItems.length} 個收藏景點`);
    setMarkdownText('');
  };

  const exportMarkdown = () => {
    const lines = [];
    lines.push(`# ${tripName}`);
    lines.push(`- 日期：${tripStartDate||'未設定'} ~ ${tripEndDate||'未設定'}`);
    lines.push(`- 幣別：${baseCurrency}`);
    lines.push('');

    // 必帶物品
    const mustHave = checklist.filter(i => !i.type || i.type !== 'ticket');
    if (mustHave.length > 0) {
      lines.push('## 必帶物品');
      mustHave.forEach(i => lines.push(`- ${i.text}`));
      lines.push('');
    }

    // 住宿
    if (accommodations.length > 0) {
      lines.push('## 住宿');
      accommodations.forEach(a => {
        lines.push(`- 入住：${a.checkIn||a.date||''}`);
        lines.push(`  退房：${a.checkOut||''}`);
        lines.push(`  名稱：${a.name||''}`);
        if (a.location) lines.push(`  地點：${a.location}`);
      });
      lines.push('');
    }

    // 行程（依日期分組排序）
    const sortedItems = [...itinerary].sort((a, b) => {
      if (a.date < b.date) return -1;
      if (a.date > b.date) return 1;
      return (a.time || '').localeCompare(b.time || '');
    });
    const byDate = sortedItems.reduce((acc, item) => {
      const d = item.date || '未定日期';
      if (!acc[d]) acc[d] = [];
      acc[d].push(item);
      return acc;
    }, {});

    if (Object.keys(byDate).length > 0) {
      lines.push('## 行程');
      Object.entries(byDate).forEach(([date, items]) => {
        lines.push(`### ${date}`);
        items.forEach(item => {
          if (item.type === 'transport') {
            lines.push(`#### [交通] ${item.time || ''}`);
            if (item.transportMode) lines.push(`- 交通方式：${item.transportMode}`);
            if (item.from)          lines.push(`- 搭車地點：${item.from}`);
            if (item.to)            lines.push(`- 下車地點：${item.to}`);
            if (item.title)         lines.push(`- 班次名稱：${item.title}`);
            if (item.duration)      lines.push(`- 預估時間：${item.duration}`);
            if (item.price)         lines.push(`- 票價：${item.price}${item.priceCurrency&&item.priceCurrency!==baseCurrency?' '+item.priceCurrency:''}`);
            if (item.needTicket)    lines.push(`- 需提前購票：是`);
            if (item.ticketDeadline)lines.push(`- 購票截止：${item.ticketDeadline}`);
            if (item.url)           lines.push(`- 購票連結：${item.url}`);
            if (item.notes)         lines.push(`- 備註：${item.notes}`);
          } else {
            lines.push(`#### [景點] ${item.time || '00:00'} ${item.title}`);
            if (item.location)      lines.push(`- 地點：${item.location}`);
            if (item.notes)         lines.push(`- 備註：${item.notes}`);
            if (item.tickets)       lines.push(`- 門票：${item.tickets}`);
            if (item.hours)         lines.push(`- 營業時間：${item.hours}`);
            if (item.website)       lines.push(`- 官網：${item.website}`);
          }
        });
        lines.push('');
      });
    }

    // 收藏景點
    if (savedSpots.length > 0) {
      lines.push('## 收藏景點');
      savedSpots.forEach(s => {
        lines.push(`- 名稱：${s.name}`);
        if (s.note) lines.push(`  備註：${s.note}`);
        if (s.url)  lines.push(`  連結：${s.url}`);
      });
      lines.push('');
    }

    const md = lines.join('\n');
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${tripName}.md`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    showToast('✅ 已匯出 Markdown');
  };
  const toggleChecklist = (id) => setChecklist(list => list.map(i => i.id === id ? { ...i, checked: !i.checked } : i));
  const moveChecklistItemBefore = (fromId, toId) => {
    setChecklist(list => {
      const nonTicket = list.filter(i => i.type !== 'ticket');
      const fromIdx = nonTicket.findIndex(i => i.id === fromId);
      if (fromIdx < 0) return list;
      const arr = [...nonTicket];
      const [moved] = arr.splice(fromIdx, 1);
      const toIdx = arr.findIndex(i => i.id === toId);
      arr.splice(toIdx < 0 ? arr.length : toIdx, 0, moved);
      return [...list.filter(i => i.type === 'ticket'), ...arr];
    });
    setMovingChecklistId(null);
  };
  const addChecklistItem = () => {
    if (!newChecklistItem.trim()) return;
    setChecklist(list => [...list, { id: crypto.randomUUID(), text: newChecklistItem.trim(), checked: false }]);
    setNewChecklistItem('');
  };
  const deleteChecklistItem = async (id) => {
    if (!await confirm('確定要刪除這個清單項目嗎？', '確認刪除')) return;
    setChecklist(list => list.filter(i => i.id !== id));
  };
  const toggleShop = (iId, sId) => setItinerary(list => list.map(i => i.id === iId
    ? { ...i, shoppingList: (i.shoppingList || []).map(s => s.id === sId ? { ...s, checked: !s.checked } : s) }
    : i));

  const exportCSV = () => {
    const tripDateInfo = tripStartDate&&tripEndDate ? `${tripStartDate} ~ ${tripEndDate}` : tripStartDate||'未設定';
    let csv = `\uFEFF旅程名稱,${tripName}\n旅行日期,${tripDateInfo}\n基準幣別,${baseCurrency}\n\n`;
    csv += '日期/時間,關聯行程,分類,描述,原始金額,幣別,換算金額('+baseCurrency+'),付款人,' + users.map(u=>`[${u}]需付(${baseCurrency})`).join(',') + '\n';
    expenses.forEach(exp => {
      const rel = itinerary.find(i=>i.id===exp.itineraryId);
      const expRate=rates[exp.currency]||1, baseRate=rates[baseCurrency]||1;
      const converted=((exp.amount*expRate)/baseRate).toFixed(2);
      const splits=users.map(u => {
        if(exp.splitMode==='custom') return ((exp.customSplit?.[u]||0)*(expRate/baseRate)).toFixed(2);
        if((exp.splitAmong||[]).includes(u)) return (((exp.amount/(exp.splitAmong.length||1))*expRate/baseRate).toFixed(2));
        return '0';
      });
      const row=[rel?`${rel.date} ${rel.time}`:'無',rel?rel.title:'無',exp.category||'其他',exp.description||exp.title||'',exp.amount,exp.currency,converted,exp.paidBy,...splits].map(f=>`"${String(f).replace(/"/g,'""')}"`).join(',');
      csv+=row+'\n';
    });
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
    a.download=`${tripName}-花費明細.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    showToast('已匯出 CSV ✓');
  };

  // ─── Expense state（使用 ExpenseFormModal，格式與舊版一致）────────────────────
  const [addingExpenseFor, setAddingExpenseFor] = useState(null);
  const [editingExpense,   setEditingExpense]   = useState(null);

  const saveExpense = (exp) => {
    lastLocalSaveTime.current = Date.now();
    const clean = cleanForFirestore(exp);
    if (clean.id) setExpenses(prev => prev.map(e => e.id===clean.id ? clean : e));
    else          setExpenses(prev => [...prev, {...clean, id: crypto.randomUUID()}]);
    setAddingExpenseFor(null);
    setEditingExpense(null);
    showToast(clean.id ? '✅ 已更新帳務' : '✅ 已記帳');
  };

  const deleteExpense = async (id) => {
    if (!await confirm('確定刪除此筆紀錄？', '確認刪除')) return;
    lastLocalSaveTime.current = Date.now();
    setExpenses(prev => prev.filter(e => e.id !== id));
    showToast('🗑 已刪除');
  };

  // ─── Checklist Sheet state ────────────────────────────────────────────────
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetInput, setSheetInput] = useState('');
  const sheetInputRef = React.useRef(null);
  const submitSheet = () => {
    if (!sheetInput.trim()) return;
    setChecklist(l => [...l, {
      id: crypto.randomUUID(),
      text: sheetInput.trim(),
      checked: false,
      type: newCheckType === 'memo' ? 'memo' : undefined,
    }]);
    setSheetInput('');
    setSheetOpen(false);
  };
  React.useEffect(() => { if (sheetOpen) setTimeout(() => sheetInputRef.current?.focus(), 80); }, [sheetOpen]);

    const [swipeMap, setSwipeMap] = useState({});
  const openSwipe = (id) => setSwipeMap(prev => ({...prev, [id]: true}));
  const closeSwipe = (id) => setSwipeMap(prev => { const n={...prev}; delete n[id]; return n; });
  const closeAllSwipe = () => setSwipeMap({});

  const [editingCheckId, setEditingCheckId] = useState(null);
  const [editingCheckText, setEditingCheckText] = useState('');
  const startEditCheck = (item) => { setEditingCheckId(item.id); setEditingCheckText(item.text); };
  const saveEditCheck = () => {
    if (editingCheckText.trim()) {
      setChecklist(list => list.map(i => i.id===editingCheckId ? {...i, text:editingCheckText.trim()} : i));
    }
    setEditingCheckId(null);
  };

  const openDetailSheet = (item) => {
    setDetailSheet(item);
    setDetailData({...item});
    setEditExpandedId(null);
  };
  const saveDetailSheet = () => {
    const prev = detailSheet;
    setItinerary(list => list.map(i => i.id === prev.id ? cleanForFirestore({...detailData}) : i));
    // 若此行程項目來自收藏景點，同步更新 savedSpot（景點名稱、地點、備註、連結）
    if (detailData.type === 'place' && detailData.spotId) {
      setSavedSpots(spots => spots.map(s => s.id === detailData.spotId
        ? { ...s,
            name:     detailData.title    || s.name,
            location: detailData.location !== undefined ? detailData.location : s.location,
            note:     detailData.notes    !== undefined ? detailData.notes    : s.note,
            url:      detailData.website  !== undefined ? detailData.website  : s.url,
          }
        : s
      ));
    }
    // needTicket 變成 true 且行前清單尚無此條目 → 自動新增
    if (detailData.type === 'transport' && detailData.needTicket && !prev.needTicket) {
      const label = [detailData.transportMode, detailData.from && detailData.to ? `${detailData.from}→${detailData.to}` : ''].filter(Boolean).join(' ');
      setChecklist(cl => {
        if (cl.some(c => c.itineraryId === prev.id && c.type === 'ticket')) return cl;
        return [...cl, cleanForFirestore({
          id: crypto.randomUUID(),
          type: 'ticket',
          text: `購票：${label || '交通票'}`,
          checked: false,
          itineraryId: prev.id,
          ticketDeadline: detailData.ticketDeadline || '',
          ticketMode: detailData.transportMode || '',
          ticketDest: detailData.to || '',
        })];
      });
    }
    setDetailSheet(null);
    showToast('已儲存 ✓');
  };
  const deleteFromDetail = async () => {
    if (!await confirm('確定要刪除這個行程嗎？', '確認刪除')) return;
    const item = detailSheet;
    // 若景點來自收藏（有 spotId），刪除後移回收藏
    if (item.spotId) {
      const alreadySaved = savedSpots.some(s => s.id === item.spotId);
      if (!alreadySaved) {
        setSavedSpots(prev => [...prev, {
          id: item.spotId,
          name: item.title,
          location: item.location || '',
          note: item.notes || '',
          url: item.website || '',
          createdAt: new Date().toISOString(),
        }]);
      }
      showToast('已移回收藏景點');
    } else {
      showToast('已刪除');
    }
    setItinerary(list => list.filter(i => i.id !== item.id));
    setDetailSheet(null);
  };

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

  // 網路狀態監聽 — 離線時同步更新 saveStatus
  useEffect(() => {
    const on  = () => { setIsOnline(true);  setSaveStatus(s => s === 'offline' ? 'saved' : s); };
    const off = () => { setIsOnline(false); setSaveStatus('offline'); };
    window.addEventListener('online',  on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // 重新上線時合併遠端新增的項目（避免 A 裝置的離線寫入覆蓋掉其他裝置在連線期間的新增）
  useEffect(() => {
    if (!isOnline) { wasOffline.current = true; return; }
    if (!wasOffline.current || !uid || !tripId) return;
    wasOffline.current = false;
    getDoc(doc(db, 'users', uid, 'trips', tripId)).then(snap => {
      if (!snap.exists()) return;
      const remote = snap.data();
      const lastSaved = prevSavedPayload.current;
      const mergeById = (localArr, remoteArr, lastArr) => {
        const lastIds  = new Set((lastArr  || []).map(i => i.id).filter(Boolean));
        const localIds = new Set((localArr || []).map(i => i.id).filter(Boolean));
        const remoteNew = (remoteArr || []).filter(i => i.id && !lastIds.has(i.id) && !localIds.has(i.id));
        return [...(localArr || []), ...remoteNew];
      };
      if (remote.itinerary)  setItinerary( prev => mergeById(prev, remote.itinerary,  lastSaved?.itinerary));
      if (remote.checklist)  setChecklist( prev => mergeById(prev, remote.checklist,  lastSaved?.checklist));
      if (remote.expenses)   setExpenses(  prev => mergeById(prev, remote.expenses,   lastSaved?.expenses));
      if (remote.savedSpots) setSavedSpots(prev => mergeById(prev, remote.savedSpots, lastSaved?.savedSpots));
    }).catch(() => {});
  }, [isOnline, uid, tripId]);

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
    <div className="max-w-md mx-auto flex flex-col"
      style={{background:'#FFFFFF', fontFamily:"'DM Sans','Noto Sans TC',sans-serif", height:'100dvh', overflow:'hidden', paddingTop:'env(safe-area-inset-top, 0px)', paddingBottom:'calc(56px + env(safe-area-inset-bottom, 0px))'}}>

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

      {/* 離線橫條 banner */}
      {!isOnline && (
        <div className="shrink-0 flex items-center justify-center gap-2 px-4 py-2"
          style={{background:C.warning}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
            <line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.56 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"/>
          </svg>
          <p className="text-xs font-black text-white">離線中 — 資料已暫存，上線後自動同步</p>
        </div>
      )}
      {movingItemId && (
        <div className="shrink-0 flex items-center justify-between px-4 py-3"
          style={{background:C.warning}}>
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
      <header className="shrink-0 border-b" style={{background:C.card, borderColor:C.border}}>
        <div className="flex items-center gap-3 px-4 pt-3 pb-2">
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
          {/* 儲存/連線狀態 */}
          {(() => {
            if (!isOnline) return (
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{background:C.warning}} title="離線中"/>
            );
            if (saveStatus === 'saving') return (
              <div className="w-4 h-4 shrink-0 flex items-center justify-center">
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="2.5">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                </svg>
              </div>
            );
            if (saveStatus === 'error') return (
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{background:C.danger}} title="同步失敗"/>
            );
            return (
              <div className="w-2.5 h-2.5 rounded-full shrink-0 transition-colors duration-500" style={{background:'#4ade80'}} title="已同步"/>
            );
          })()}
          {!readOnly && (
            <>
              {/* 行程 mode 才顯示編輯按鈕 */}
              {mode==='itinerary' && (
                <button
                  onClick={()=>{ setIsEditMode(v=>!v); setMovingItemId(null); setFabOpen(false); }}
                  className="p-2 rounded-xl transition-all"
                  title={isEditMode ? '切換瀏覽模式' : '切換編輯模式'}
                  style={isEditMode ? {background:C.primary, color:'#fff'} : {background:C.primaryLight, color:C.primary}}>
                  {isEditMode
                    ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  }
                </button>
              )}
              <button onClick={()=>setIsShareOpen(true)} className="p-2 rounded-full active:opacity-60" style={{color:C.muted}}>
                <Share2 size={19}/>
              </button>
              <button onClick={()=>setIsSettingsOpen(true)} className="p-2 rounded-full active:opacity-60" style={{color:C.muted}}>
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
                  ? `${fmtShort(tripStartDate)} – ${fmtShort(tripEndDate)} · ${tripDateRange.length}天 · ${users.length} 人同行`
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
            <div className="scroll-area flex-1 pb-6">

              {/* 行前清單 */}
              {listTab==='pretrip' && (
                <div>
                  {/* 移動提示橫條 */}
                  {movingChecklistId && (
                    <div className="flex items-center justify-between px-4 py-3 sticky top-0 z-10"
                      style={{background:C.warning}}>
                      <p className="text-sm font-black text-white">點選要插入到哪個項目前面</p>
                      <button onClick={()=>setMovingChecklistId(null)} className="text-white opacity-80 active:opacity-60"><X size={18}/></button>
                    </div>
                  )}

                  {/* ── 購票提醒區塊（可折疊）── */}
                  {(() => {
                    const today = new Date(); today.setHours(0,0,0,0);
                    const ticketItems = checklist.filter(i=>i.type==='ticket');
                    const pendingTickets = ticketItems.filter(i=>!i.checked);
                    const doneTickets = ticketItems.filter(i=>i.checked);
                    if (!ticketItems.length) return null;
                    const DeadlineBadge = (item) => {
                      if (!item.ticketDeadline) return null;
                      const dl = new Date(item.ticketDeadline); dl.setHours(0,0,0,0);
                      const diff = Math.round((dl-today)/(1000*60*60*24));
                      if (diff < 0) return <span className="text-[10px] font-black px-2 py-0.5 rounded-full shrink-0" style={{background:'#FFF0F0',color:C.danger}}>已逾期</span>;
                      if (diff <= 30) return <span className="text-[10px] font-black px-2 py-0.5 rounded-full shrink-0" style={{background:C.warningLight,color:C.warning}}>截止 {item.ticketDeadline.slice(5).replace('-','/')}（{diff}天）</span>;
                      return <span className="text-[10px] px-2 py-0.5 rounded-full shrink-0" style={{background:'#F4F7FA',color:C.muted}}>截止 {item.ticketDeadline.slice(5).replace('-','/')}</span>;
                    };
                    return (
                      <div>
                        <button onClick={()=>setShowTicketSection(v=>!v)} className="w-full flex items-center gap-2 px-4 pt-3 pb-2">
                          <Ticket size={13} style={{color:C.warning}}/>
                          <span className="text-[11px] font-black uppercase tracking-widest flex-1 text-left" style={{color:C.warning}}>購票提醒</span>
                          {pendingTickets.length>0 && <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full" style={{background:C.warningLight,color:C.warning}}>{pendingTickets.length}</span>}
                          <ChevronDown size={13} className={`transition-transform ${showTicketSection?'rotate-180':''}`} style={{color:C.warning}}/>
                        </button>
                        {showTicketSection && (
                          <>
                            {pendingTickets.map(item=>(
                              <div key={item.id} className="flex items-center gap-3 px-4 py-3.5" style={{borderBottom:`1px solid ${C.border}`, background:C.warningLight}}>
                                <button onClick={()=>toggleChecklist(item.id)} className="w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0" style={{borderColor:C.warning,background:'transparent'}}>
                                  <Ticket size={11} style={{color:C.warning}}/>
                                </button>
                                <span className="flex-1 text-sm font-medium" style={{color:C.ink}}>{item.text}</span>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {DeadlineBadge(item)}
                                  {!readOnly&&<button onClick={()=>deleteChecklistItem(item.id)} className="p-1" style={{color:C.danger}}><Trash2 size={13}/></button>}
                                </div>
                              </div>
                            ))}
                            {doneTickets.length>0 && (
                              <>
                                <button onClick={()=>setShowDoneTickets(v=>!v)} className="flex items-center gap-2 px-4 py-2.5 w-full text-xs font-bold" style={{color:C.muted,borderBottom:`1px solid ${C.border}`}}>
                                  <ChevronDown size={13} className={`transition-transform ${showDoneTickets?'rotate-180':''}`}/>已完成購票 ({doneTickets.length})
                                </button>
                                {showDoneTickets && doneTickets.map(item=>(
                                  <div key={item.id} className="flex items-center gap-3 px-4 py-3.5" style={{borderBottom:`1px solid ${C.border}`}}>
                                    <button onClick={()=>toggleChecklist(item.id)} className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{background:'#4ade80'}}>
                                      <Check size={12} color="#fff"/>
                                    </button>
                                    <span className="flex-1 text-sm line-through" style={{color:C.muted}}>{item.text}</span>
                                  </div>
                                ))}
                              </>
                            )}
                          </>
                        )}
                        <div className="h-px" style={{background:C.border}}/>
                      </div>
                    );
                  })()}

                  {/* ── 待辦 section（可折疊）── */}
                  {(()=>{
                    const todoItems = checklist.filter(i=>!i.checked && i.type!=='ticket' && i.type!=='memo');
                    if (!todoItems.length) return null;
                    const renderItem = (item, idx, arr) => (
                      <div key={item.id} style={{borderBottom:`1px solid ${C.border}`, overflow:'hidden', position:'relative'}}>
                        <div className="absolute inset-y-0 right-0 flex items-center px-4" style={{background:C.danger, width:'80px', justifyContent:'center'}}>
                          <Trash2 size={18} color="#fff"/>
                        </div>
                        <div className="flex items-center gap-3 px-4 py-3 bg-white"
                          style={{
                            transform: swipeMap[item.id] ? 'translateX(-80px)' : 'translateX(0)',
                            transition: 'transform 0.2s ease', position:'relative', zIndex:1,
                            background: movingChecklistId===item.id ? C.primaryLight : '#fff',
                          }}
                          onPointerDown={e => { e._sx = e.clientX; }}
                          onPointerUp={e => { const dx = e.clientX - (e._sx||e.clientX); if (dx < -40) openSwipe(item.id); else if (dx > 10) closeSwipe(item.id); }}>
                          {/* 移動 handle */}
                          {!readOnly && (
                            <button
                              onClick={()=>{
                                if (movingChecklistId === item.id) setMovingChecklistId(null);
                                else if (movingChecklistId) moveChecklistItemBefore(movingChecklistId, item.id);
                                else setMovingChecklistId(item.id);
                              }}
                              className="p-1 rounded shrink-0"
                              style={{color: movingChecklistId===item.id ? C.warning : movingChecklistId ? C.primary : C.muted,
                                background: movingChecklistId===item.id ? C.warningLight : 'transparent'}}>
                              {movingChecklistId===item.id
                                ? <X size={13}/>
                                : movingChecklistId
                                  ? <ArrowRight size={13}/>
                                  : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                      <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
                                      <line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/>
                                      <line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
                                    </svg>
                              }
                            </button>
                          )}
                          <button onClick={()=>{ closeAllSwipe(); toggleChecklist(item.id); }}
                            className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0"
                            style={{borderColor:C.muted, background:'transparent'}}/>
                          {editingCheckId===item.id ? (
                            <input autoFocus value={editingCheckText} onChange={e=>setEditingCheckText(e.target.value)} onBlur={saveEditCheck} onKeyDown={e=>e.key==='Enter'&&saveEditCheck()} className="flex-1 text-sm font-medium border-b bg-transparent" style={{color:C.ink, borderColor:C.primary}}/>
                          ) : (
                            <span className="flex-1 text-sm font-medium" style={{color:C.ink}} onClick={()=>closeAllSwipe()}>{item.text}</span>
                          )}
                          {!readOnly && (
                            <div className="flex items-center gap-0 shrink-0">
                              <button onClick={()=>{ closeAllSwipe(); startEditCheck(item); }} className="p-1.5" style={{color:C.muted}}><Edit2 size={13}/></button>
                              <button onClick={()=>{ closeSwipe(item.id); deleteChecklistItem(item.id); }} className="p-1" style={{color:swipeMap[item.id]?C.danger:C.border}}><Trash2 size={13}/></button>
                            </div>
                          )}
                        </div>
                        {swipeMap[item.id] && <button className="absolute inset-y-0 right-0 flex items-center justify-center" style={{width:'80px', zIndex:2}} onClick={()=>{ closeSwipe(item.id); deleteChecklistItem(item.id); }}/>}
                      </div>
                    );
                    return (
                      <div>
                        <button onClick={()=>setShowTodoSection(v=>!v)} className="w-full flex items-center gap-2 px-4 pt-3 pb-2">
                          <ListTodo size={13} style={{color:C.primary}}/>
                          <span className="text-[11px] font-black uppercase tracking-widest flex-1 text-left" style={{color:C.primary}}>待辦</span>
                          <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full" style={{background:C.primaryLight,color:C.primary}}>{todoItems.length}</span>
                          <ChevronDown size={13} className={`transition-transform ${showTodoSection?'rotate-180':''}`} style={{color:C.muted}}/>
                        </button>
                        {showTodoSection && todoItems.map((item, idx, arr) => renderItem(item, idx, arr))}
                        <div className="h-px" style={{background:C.border}}/>
                      </div>
                    );
                  })()}

                  {/* ── 備忘 section（可折疊）── */}
                  {(()=>{
                    const memoItems = checklist.filter(i=>!i.checked && i.type==='memo');
                    if (!memoItems.length) return null;
                    return (
                      <div>
                        <button onClick={()=>setShowMemoSection(v=>!v)} className="w-full flex items-center gap-2 px-4 pt-3 pb-2">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2.5" strokeLinecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          <span className="text-[11px] font-black uppercase tracking-widest flex-1 text-left" style={{color:C.muted}}>備忘</span>
                          <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full" style={{background:'#F4F7FA',color:C.muted}}>{memoItems.length}</span>
                          <ChevronDown size={13} className={`transition-transform ${showMemoSection?'rotate-180':''}`} style={{color:C.muted}}/>
                        </button>
                        {showMemoSection && memoItems.map(item=>(
                          <div key={item.id} style={{borderBottom:`1px solid ${C.border}`, overflow:'hidden', position:'relative'}}>
                            <div className="absolute inset-y-0 right-0 flex items-center px-4" style={{background:C.danger, width:'80px', justifyContent:'center'}}>
                              <Trash2 size={18} color="#fff"/>
                            </div>
                            <div className="flex items-center gap-3 px-4 py-3 bg-white"
                              style={{transform: swipeMap[item.id] ? 'translateX(-80px)' : 'translateX(0)', transition:'transform 0.2s ease', position:'relative', zIndex:1}}
                              onPointerDown={e => { e._sx = e.clientX; }}
                              onPointerUp={e => { const dx = e.clientX - (e._sx||e.clientX); if (dx < -40) openSwipe(item.id); else if (dx > 10) closeSwipe(item.id); }}>
                              {!readOnly && (
                                <button onClick={()=>{
                                  if (movingChecklistId===item.id) setMovingChecklistId(null);
                                  else if (movingChecklistId) moveChecklistItemBefore(movingChecklistId, item.id);
                                  else setMovingChecklistId(item.id);
                                }} className="p-1 rounded shrink-0"
                                  style={{color:movingChecklistId===item.id?C.warning:movingChecklistId?C.primary:C.muted,
                                    background:movingChecklistId===item.id?C.warningLight:'transparent'}}>
                                  {movingChecklistId===item.id?<X size={13}/>:movingChecklistId?<ArrowRight size={13}/>:
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                      <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
                                      <line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/>
                                      <line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
                                    </svg>}
                                </button>
                              )}
                              <span className="text-[10px] font-black px-1.5 py-0.5 rounded shrink-0" style={{background:'#F4F7FA',color:C.muted}}>備忘</span>
                              {editingCheckId===item.id ? (
                                <input autoFocus value={editingCheckText} onChange={e=>setEditingCheckText(e.target.value)} onBlur={saveEditCheck} onKeyDown={e=>e.key==='Enter'&&saveEditCheck()} className="flex-1 text-sm font-medium border-b bg-transparent" style={{color:C.ink, borderColor:C.primary}}/>
                              ) : (
                                <span className="flex-1 text-sm italic" style={{color:C.muted}} onClick={()=>closeAllSwipe()}>{item.text}</span>
                              )}
                              {!readOnly && (
                                <div className="flex items-center gap-0 shrink-0">
                                  <button onClick={()=>{ closeAllSwipe(); startEditCheck(item); }} className="p-1.5" style={{color:C.muted}}><Edit2 size={13}/></button>
                                  <button onClick={()=>{ closeSwipe(item.id); deleteChecklistItem(item.id); }} className="p-1" style={{color:swipeMap[item.id]?C.danger:C.border}}><Trash2 size={13}/></button>
                                </div>
                              )}
                            </div>
                            {swipeMap[item.id] && <button className="absolute inset-y-0 right-0 flex items-center justify-center" style={{width:'80px', zIndex:2}} onClick={()=>{ closeSwipe(item.id); deleteChecklistItem(item.id); }}/>}
                          </div>
                        ))}
                        <div className="h-px" style={{background:C.border}}/>
                      </div>
                    );
                  })()}

                  {/* 已完成一般清單 */}
                  {checklist.filter(i=>i.checked&&i.type!=='ticket').length>0 && (
                    <>
                      <button onClick={()=>setShowDoneRegular(v=>!v)} className="flex items-center gap-2 px-4 py-3.5 w-full text-sm font-bold" style={{color:C.muted, borderBottom:`1px solid ${C.border}`}}>
                        <ChevronDown size={15} className={`transition-transform ${showDoneRegular?'rotate-180':''}`}/>
                        已完成 ({checklist.filter(i=>i.checked&&i.type!=='ticket').length})
                      </button>
                      {showDoneRegular && checklist.filter(i=>i.checked&&i.type!=='ticket').map(item=>(
                        <div key={item.id} className="flex items-center gap-3 px-4 py-3.5" style={{borderBottom:`1px solid ${C.border}`, opacity:0.5}}>
                          <button onClick={()=>toggleChecklist(item.id)} className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{background:C.primary}}><Check size={11} color="#fff"/></button>
                          <span className="flex-1 text-sm line-through" style={{color:C.muted}}>{item.text}</span>
                        </div>
                      ))}
                    </>
                  )}
                  {checkTotal===0 && <div className="py-16 text-center text-sm" style={{color:C.muted}}>尚無清單項目，點右下＋新增</div>}
                </div>
              )}

              {/* 購物總覽 */}
              {listTab==='shopping' && (
                <div className="px-4 py-4 space-y-4">
                  {(() => {
                    const shopItems = itinerary.filter(i=>i.shoppingList?.length>0);
                    if (!shopItems.length) return (
                      <div className="text-center py-16 flex flex-col items-center gap-3" style={{color:C.muted}}>
                        <ShoppingBag size={44} opacity={0.2}/>
                        <p className="text-sm font-medium">目前沒有任何購物清單</p>
                        <p className="text-xs">在行程景點裡新增購物項目</p>
                      </div>
                    );
                    return shopItems.map(item=>(
                      <div key={item.id} className="rounded-2xl border overflow-hidden" style={{background:C.card, borderColor:C.border, boxShadow:C.cardShadow}}>
                        <div className="flex items-center gap-1.5 px-4 py-3 border-b" style={{borderColor:C.border}}>
                          <MapPin size={13} style={{color:C.primary}}/>
                          <span className="flex-1 text-sm font-bold" style={{color:C.ink}}>{item.title}</span>
                          <span className="text-xs font-medium mr-2" style={{color:C.muted}}>({fmtDate(item.date)})</span>
                          {!readOnly && (
                            <button onClick={()=>setShopAddSheet(item.id)}
                              className="flex items-center gap-1 text-[11px] font-black px-2 py-1 rounded-lg"
                              style={{background:C.primaryLight, color:C.primary}}>
                              <Plus size={11}/>新增
                            </button>
                          )}
                        </div>
                        <div className="px-4 py-3 space-y-3">
                          {item.shoppingList.map(s=>(
                            <div key={s.id} className="flex items-center gap-3">
                              <button onClick={()=>toggleShop(item.id,s.id)} className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all" style={s.checked?{background:C.primary,borderColor:C.primary}:{borderColor:C.muted}}>
                                {s.checked && <Check size={11} color="#fff"/>}
                              </button>
                              <span className="flex-1 text-sm font-medium" style={{color:s.checked?C.muted:C.ink, textDecoration:s.checked?'line-through':'none'}}>{s.text}</span>
                              {!readOnly && (
                                <button onClick={()=>setItinerary(list=>list.map(i=>i.id===item.id?{...i,shoppingList:i.shoppingList.filter(x=>x.id!==s.id)}:i))}
                                  className="p-1 shrink-0" style={{color:s.checked?C.muted:C.danger}}>
                                  <Trash2 size={13}/>
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              )}

              {/* 收藏景點（item 5）*/}
              {listTab==='spots' && (
                <div>
                  {savedSpots.length===0 && (
                    <div className="py-12 text-center flex flex-col items-center gap-3" style={{color:C.muted}}>
                      <Star size={44} opacity={0.2}/>
                      <p className="text-sm font-medium">尚無收藏景點</p>
                      <p className="text-xs">在網路上看到不錯的景點，先存在這裡</p>
                    </div>
                  )}
                  {savedSpots.map(spot=>(
                    <div key={spot.id} style={{borderBottom:`1px solid ${C.border}`}}>
                      {editingSpotId===spot.id ? (
                        <div className="px-4 py-3 space-y-2">
                          {(() => {
                            const linkedCount = itinerary.filter(i=>i.spotId===spot.id).length;
                            return linkedCount > 0 ? (
                              <p className="text-[11px] font-bold px-2 py-1 rounded-lg" style={{background:C.primaryLight,color:C.primary}}>
                                ↔ 已連動 {linkedCount} 個行程項目，儲存後同步更新
                              </p>
                            ) : null;
                          })()}
                          <input className="w-full border rounded-xl px-3 py-2 text-sm font-bold" style={{borderColor:C.primary,color:C.ink}} value={editingSpotData.name||''} onChange={e=>setEditingSpotData(d=>({...d,name:e.target.value}))} placeholder="景點名稱"/>
                          <input className="w-full border rounded-xl px-3 py-2 text-sm" style={{borderColor:C.border,color:C.ink}} value={editingSpotData.location||''} onChange={e=>setEditingSpotData(d=>({...d,location:e.target.value}))} placeholder="地點（Google Maps 搜尋用）"/>
                          <textarea className="w-full border rounded-xl px-3 py-2 text-sm resize-none" rows={2} style={{borderColor:C.border,color:C.ink}} value={editingSpotData.note||''} onChange={e=>setEditingSpotData(d=>({...d,note:e.target.value}))} placeholder="備註"/>
                          <input className="w-full border rounded-xl px-3 py-2 text-sm" style={{borderColor:C.border,color:C.ink}} value={editingSpotData.url||''} onChange={e=>setEditingSpotData(d=>({...d,url:e.target.value}))} placeholder="來源連結"/>
                          <div className="flex gap-2">
                            <button onClick={()=>{
                              setSavedSpots(p=>p.map(s=>s.id===spot.id?{...s,...editingSpotData}:s));
                              // 同步所有連結此景點的行程項目
                              setItinerary(items=>items.map(item=>
                                item.spotId===spot.id
                                  ? { ...item,
                                      title:    editingSpotData.name     || item.title,
                                      location: editingSpotData.location !== undefined ? editingSpotData.location : item.location,
                                      notes:    editingSpotData.note     !== undefined ? editingSpotData.note     : item.notes,
                                      website:  editingSpotData.url      !== undefined ? editingSpotData.url      : item.website,
                                    }
                                  : item
                              ));
                              setEditingSpotId(null);
                            }} className="flex-1 py-2 rounded-xl text-xs font-black text-white" style={{background:C.primary}}>儲存</button>
                            <button onClick={()=>setEditingSpotId(null)} className="px-4 py-2 rounded-xl text-xs font-bold" style={{background:'#F4F7FA',color:C.muted}}>取消</button>
                          </div>
                        </div>
                      ) : (
                        <>
                        <div className="flex items-center gap-3 px-4 py-3.5">
                          <button onClick={()=>setExpandedSpotId(expandedSpotId===spot.id?null:spot.id)} className="flex-1 text-left flex items-center gap-2 min-w-0">
                            <Star size={14} style={{color:C.warning, fill:C.warning, flexShrink:0}}/>
                            <span className="text-sm font-bold truncate" style={{color:C.ink}}>{spot.name}</span>
                            {(spot.location||spot.note||spot.url)&&<ChevronDown size={13} className={`transition-transform shrink-0 ${expandedSpotId===spot.id?'rotate-180':''}`} style={{color:C.muted}}/>}
                          </button>
                          <div className="flex items-center gap-1 shrink-0">
                            {!readOnly&&<button onClick={()=>setAddingSpotToDate(addingSpotToDate===spot.id?null:spot.id)} className="text-[11px] font-black px-2.5 py-1.5 rounded-full" style={{background:addingSpotToDate===spot.id?C.primary:C.primaryLight,color:addingSpotToDate===spot.id?'#fff':C.primary}}>+ 行程</button>}
                            {!readOnly&&<button onClick={()=>{setEditingSpotId(spot.id);setEditingSpotData({name:spot.name,location:spot.location||'',note:spot.note||'',url:spot.url||''});}} className="p-1.5" style={{color:C.muted}}><Edit2 size={13}/></button>}
                            {!readOnly&&<button onClick={()=>setSavedSpots(p=>p.filter(s=>s.id!==spot.id))} className="p-1.5" style={{color:C.danger}}><Trash2 size={14}/></button>}
                          </div>
                        </div>
                        {expandedSpotId===spot.id&&(spot.location||spot.note||spot.url)&&(
                          <div className="px-4 pb-3 space-y-1">
                            {spot.location&&<a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(spot.location)}`} target="_blank" rel="noreferrer" className="text-xs flex items-center gap-1 hover:underline" style={{color:C.primary}}><MapPin size={11}/>{spot.location}</a>}
                            {spot.note&&<p className="text-xs" style={{color:C.body}}>{spot.note}</p>}
                            {spot.url&&<a href={spot.url} target="_blank" rel="noreferrer" className="text-xs underline truncate block" style={{color:C.primary}}>{spot.url}</a>}
                          </div>
                        )}
                        </>
                      )}
                      {addingSpotToDate===spot.id&&(
                        <div className="px-4 pb-3">
                          <p className="text-xs font-black mb-2" style={{color:C.primary}}>選擇加入的日期：</p>
                          <div className="flex flex-wrap gap-2">
                            {(tripDateRange.length>0?tripDateRange:[...new Set(itinerary.map(i=>i.date))].filter(Boolean).sort()).map((d,i)=>{
                              const dt=new Date(d);
                              return <button key={d} onClick={()=>{
                                setItinerary(p=>[...p,{id:crypto.randomUUID(),type:'place',date:d,time:'',title:spot.name,location:spot.location||spot.name||'',notes:spot.note||'',website:spot.url||'',shoppingList:[],tickets:'',hours:'',spotId:spot.id,lastEditedBy:currentUserName||'',lastEditedAt:new Date().toISOString()}]);
                                setAddingSpotToDate(null);
                                setPendingScrollToDate(d);
                                setMode('itinerary');
                                showToast('✅ 已加入行程');
                              }} className="px-3 py-1.5 rounded-xl text-xs font-bold" style={{background:C.primaryLight,color:C.primary}}>Day{i+1} {dt.getMonth()+1}/{dt.getDate()}</button>;
                            })}
                          </div>
                          <button onClick={()=>setAddingSpotToDate(null)} className="mt-2 text-xs" style={{color:C.muted}}>取消</button>
                        </div>
                      )}
                    </div>
                  ))}
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
            <div ref={itineraryScrollRef} className="scroll-area flex-1 pb-6">

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
                // 住宿：找 checkIn <= dateKey < checkOut 的住宿（支援舊格式的 date 欄位）
                const accom = accommodations.find(a => {
                  const ci = a.checkIn || a.date || '';
                  const co = a.checkOut || '';
                  if (ci && co) return dateKey >= ci && dateKey < co;
                  return ci === dateKey;
                });
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
                        <button
                          onClick={()=>{ const dest = encodeURIComponent(accom.location||accom.name); window.open(`https://www.google.com/maps/dir/?api=1&destination=${dest}`,'_blank'); }}
                          className="flex items-center gap-2 px-3 py-2 rounded-xl border ml-2 active:opacity-70"
                          style={{background:C.primaryLight, borderColor:C.primary+'33', maxWidth:'52%', flexShrink:0}}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                            <polyline points="9 22 9 12 15 12 15 22"/>
                          </svg>
                          <div className="min-w-0 text-left">
                            <p className="text-[10px] font-bold" style={{color:C.primary, opacity:0.7}}>今晚住宿 →</p>
                            <p className="text-xs font-black truncate" style={{color:C.primary}}>{accom.name}</p>
                          </div>
                        </button>
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
                                  {/* 購票狀態顯示（item 11）*/}
                                  {item.needTicket && (()=>{
                                    const today = new Date(); today.setHours(0,0,0,0);
                                    const tItem = checklist.find(c=>c.type==='ticket'&&c.itineraryId===item.id);
                                    if (tItem?.checked) return <p className="text-xs mt-1 flex items-center gap-1" style={{color:'#4ade80'}}><Check size={11}/>已購票</p>;
                                    if (item.ticketDeadline) {
                                      const dl = new Date(item.ticketDeadline); dl.setHours(0,0,0,0);
                                      const diff = Math.round((dl-today)/(1000*60*60*24));
                                      const color = diff<0?C.danger:diff<=30?C.warning:C.muted;
                                      return <p className="text-xs mt-1 font-bold flex items-center gap-1" style={{color}}>
                                        <Ticket size={11}/>⚠️ 需購票 {diff<0?'已逾期':`截止 ${item.ticketDeadline.slice(5).replace('-','/')}（${diff}天）`}
                                        <button onClick={()=>{setMode('checklist');setListTab('pretrip');}} className="underline ml-1 text-[10px]" style={{color}}>查看</button>
                                      </p>;
                                    }
                                    return <p className="text-xs mt-1" style={{color:C.muted}}>⚠️ 需提前購票</p>;
                                  })()}
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
                                  <button onClick={()=>setAddingExpenseFor(item)}
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
                                    <button onClick={()=>setAddingExpenseFor(item)}
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
                                onClick={async () => {
                                  if (!await confirm('確定要刪除這個行程嗎？', '確認刪除')) return;
                                  setItinerary(list => list.filter(i => i.id !== item.id));
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
                          <button onClick={()=>openAddItem('place', dateKey)}
                            className="fab flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-black"
                            style={{background:C.primaryLight, color:C.primary, boxShadow:C.cardShadow}}>
                            <MapPin size={16}/>新增景點
                          </button>
                          <button onClick={()=>openAddItem('transport', dateKey)}
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
                                <button key={s.id}
                                  onClick={()=>toggleShop(shopItem.id, s.id)}
                                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left active:opacity-70"
                                  style={{borderBottom:(gi<ga.length-1||si<sa.length-1)?`1px solid ${C.border}`:'none'}}>
                                  <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all"
                                    style={s.checked
                                      ? {background:C.primary, borderColor:C.primary}
                                      : {borderColor:'#D1D9E0', background:'transparent'}}>
                                    {s.checked && <Check size={11} color="#fff"/>}
                                  </div>
                                  <span className="flex-1 text-sm font-medium text-left"
                                    style={{color:s.checked?C.muted:C.ink, textDecoration:s.checked?'line-through':'none'}}>
                                    {s.text}
                                  </span>
                                </button>
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
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-bold uppercase tracking-widest" style={{color:'rgba(255,255,255,0.55)'}}>總花費</p>
                <button onClick={()=>setIsFinancePrivate(v=>!v)} className="p-1 rounded-lg active:opacity-60" style={{color:'rgba(255,255,255,0.6)'}}>
                  {isFinancePrivate
                    ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  }
                </button>
              </div>
              <p className="text-4xl font-black mb-4 tracking-tighter">
                {isFinancePrivate ? `${baseCurrency} ******` : `${baseCurrency} ${Math.round(financeSummary.total).toLocaleString()}`}
              </p>
              {/* 每人花費：顯示已付、應付、差額 */}
              <div className="grid grid-cols-2 gap-2">
                {users.map(u => {
                  const s = financeSummary.userStats[u];
                  if (!s) return null;
                  const bal = Math.round(s.paid - s.consumed);
                  return (
                    <div key={u} className="rounded-2xl p-3" style={{background:'rgba(255,255,255,0.12)'}}>
                      <p className="text-xs font-medium truncate mb-1" style={{color:'rgba(255,255,255,0.55)'}}>{u}</p>
                      <p className="text-base font-black text-white leading-tight">
                        {isFinancePrivate ? '***' : `${baseCurrency} ${Math.round(s.consumed).toLocaleString()}`}
                      </p>
                      <p className="text-[11px] mt-0.5" style={{color: bal>0?'#86efac':bal<0?'#fca5a5':'rgba(255,255,255,0.5)'}}>
                        {isFinancePrivate ? '---' : (bal>0?`+${bal.toLocaleString()} 待收`:bal<0?`${bal.toLocaleString()} 待付`:'已結清')}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 可捲動費用區 */}
            <div className="scroll-area flex-1 pb-6 px-4 space-y-4">

              {/* 分帳結果：每筆一行，橘色欠款人 → 藍色收款人，右側金額 */}
              {settlement.length > 0 && (
                <div className="rounded-2xl overflow-hidden" style={{background:C.card, boxShadow:C.cardShadow, border:`1px solid ${C.border}`}}>
                  <div className="px-4 pt-3 pb-1">
                    <p className="text-[11px] font-black uppercase tracking-widest" style={{color:C.muted}}>分帳結果</p>
                  </div>
                  <div className="px-3 pb-3 space-y-2">
                    {settlement.map((t, i) => (
                      <div key={i}
                        className="flex items-center px-4 py-3.5 rounded-2xl"
                        style={{background:'#F4F8FC'}}>
                        {/* 欠款人（橘） */}
                        <span className="text-sm font-black" style={{color:C.warning}}>{t.from}</span>
                        {/* 箭頭 */}
                        <ArrowRight size={14} className="mx-2 shrink-0" style={{color:C.muted}}/>
                        {/* 收款人（藍） */}
                        <span className="text-sm font-black" style={{color:C.primary}}>{t.to}</span>
                        {/* 金額（右對齊） */}
                        <span className="ml-auto text-sm font-black tracking-tight" style={{color:C.primaryDark}}>
                          {baseCurrency} {Math.round(t.amount).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* 全員結清提示 */}
              {settlement.length === 0 && expenses.length > 0 && (
                <div className="rounded-2xl px-4 py-3.5 flex items-center gap-2"
                  style={{background:C.card, border:`1px solid ${C.border}`, boxShadow:C.cardShadow}}>
                  <Check size={15} style={{color:'#4ade80'}}/>
                  <span className="text-sm font-bold" style={{color:C.muted}}>所有費用已結清</span>
                </div>
              )}

              {/* Expense list */}
              <div className="rounded-2xl border overflow-hidden" style={{background:C.card, borderColor:C.border, boxShadow:C.cardShadow}}>
                <div className="flex items-center justify-between px-4 py-3 border-b" style={{borderColor:C.border}}>
                  <p className="text-[11px] font-black uppercase tracking-widest" style={{color:C.muted}}>費用明細</p>
                  <button onClick={exportCSV} className="p-2 rounded-xl active:opacity-70"
                    style={{background:'#F4F7FA', color:C.muted}} title="匯出 CSV">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                  </button>
                </div>
                {expenses.length===0
                  ? <div className="px-4 py-10 text-center text-sm font-medium" style={{color:C.muted}}>尚無費用記錄，點右下＋新增</div>
                  : expenses.map((exp, idx, arr) => {
                      const rel = itinerary.find(i=>i.id===exp.itineraryId);
                      const isBase = exp.currency===baseCurrency;
                      const converted = Math.round((exp.amount*(rates[exp.currency]||1))/(rates[baseCurrency]||1));
                      return (
                        <div key={exp.id}
                          onClick={()=>!readOnly&&setEditingExpense(exp)}
                          className={`px-4 py-4 flex items-start gap-3 ${!readOnly?'cursor-pointer active:opacity-80':''}`}
                          style={{borderBottom:idx<arr.length-1?`1px solid ${C.border}`:'none'}}>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-black truncate" style={{color:C.ink}}>{exp.description||exp.title||'未命名'}</p>
                            <div className="flex flex-wrap gap-1.5 mt-1.5 items-center">
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-full" style={{background:C.primaryLight, color:C.primary}}>{exp.category||'其他'}</span>
                              <span className="text-[11px]" style={{color:C.muted}}>付：{exp.paidBy}</span>
                              <span className="text-[11px]" style={{color:C.muted}}>
                                {exp.splitMode==='aa'
                                  ? `AA×${(exp.aaSplitAmong||exp.splitAmong||[]).length}`
                                  : exp.splitMode==='custom' ? '自訂'
                                  : `分：${(exp.splitAmong||[]).join('/')}`
                                }
                              </span>
                              {rel&&<span className="text-[11px] truncate" style={{color:C.primary}}>📍{rel.title}</span>}
                            </div>
                          </div>
                          <div className="shrink-0 text-right flex flex-col items-end">
                            <p className="text-sm font-black" style={{color:C.ink}}>{exp.currency} {exp.amount?.toLocaleString()}</p>
                            {!isBase&&<p className="text-xs mt-0.5" style={{color:'#B6C9CF'}}>≈ {baseCurrency} {converted.toLocaleString()}</p>}
                            <div className="flex-1"/>
                            {!readOnly&&<button onClick={e=>{e.stopPropagation();deleteExpense(exp.id);}}
                              className="text-[11px] mt-2 px-2 py-0.5 rounded-lg font-bold"
                              style={{background:C.dangerLight,color:'#B03A2E'}}>
                              刪除
                            </button>}
                          </div>
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
        <div className="fixed z-[55]" style={{bottom:'76px', right:`max(16px, calc(50vw - 196px))`}}>
          {mode==='itinerary' && isEditMode && (
            <div className="flex flex-col gap-2 items-end">
              {/* 展開的子選項：點 + 後才出現 */}
              {fabOpen && (
                <>
                  <button
                    onClick={() => { openAddItem('transport', currentDate||sortedDates[selectedDay]||''); setFabOpen(false); }}
                    className="fab flex items-center gap-2 pr-4 pl-3 py-2.5 rounded-full text-sm font-black text-white shadow-lg"
                    style={{background:C.primary+'DD', backdropFilter:'blur(8px)', boxShadow:`0 4px 16px ${C.primary}55`}}>
                    <Car size={16}/>交通
                  </button>
                  <button
                    onClick={() => { openAddItem('place', currentDate||sortedDates[selectedDay]||''); setFabOpen(false); }}
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
          {mode==='checklist' && listTab==='pretrip' && (
            <button onClick={()=>setSheetOpen(true)}
              className="fab w-14 h-14 rounded-full flex items-center justify-center text-white shadow-xl"
              style={{background:C.primary, boxShadow:'0 4px 24px rgba(72,116,158,0.45)'}}>
              <Plus size={26}/>
            </button>
          )}
          {mode==='checklist' && listTab==='spots' && !readOnly && (
            <button onClick={()=>{ setSpotModalData({name:'',location:'',note:'',url:''}); setSpotModalOpen(true); }}
              className="fab w-14 h-14 rounded-full flex items-center justify-center text-white shadow-xl"
              style={{background:C.primary, boxShadow:'0 4px 24px rgba(72,116,158,0.45)'}}>
              <Plus size={26}/>
            </button>
          )}
          {mode==='checklist' && listTab==='shopping' && (
            <button onClick={()=>{
              const shopItems = itinerary.filter(i=>i.shoppingList?.length>=0 && i.type==='place');
              if (shopItems.length === 1) { setShopAddSheet(shopItems[0].id); }
              else if (shopItems.length === 0) { showToast('先在行程中新增景點'); }
              else { setShopAddSheet('pick'); }
            }}
              className="fab w-14 h-14 rounded-full flex items-center justify-center text-white shadow-xl"
              style={{background:C.primary, boxShadow:'0 4px 24px rgba(72,116,158,0.45)'}}>
              <Plus size={26}/>
            </button>
          )}
          {mode==='finance' && (
            <button onClick={()=>setAddingExpenseFor({title:'一般花費'})}
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
                <button onClick={() => setDetailSheet(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-full shrink-0"
                  style={{background:'#F4F7FA', color:C.muted}}>
                  <X size={16}/>
                </button>
              </div>
            </div>

            {/* 可捲動表單內容 */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

              {/* 連動收藏景點提示 */}
              {detailSheet.type === 'place' && detailData.spotId && (
                <p className="text-[11px] font-bold px-3 py-2 rounded-xl" style={{background:C.primaryLight, color:C.primary}}>
                  ↔ 連動收藏景點，儲存後自動同步更新
                </p>
              )}

              {detailSheet.type === 'transport' ? (
                /* ── 交通欄位（與新增一致）── */
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest mb-1.5" style={{color:C.muted}}>日期</p>
                      <select className="w-full border rounded-xl px-3 py-2.5 text-sm" style={{borderColor:C.border,color:C.ink}}
                        value={detailData.date||''} onChange={e=>setDetailData(d=>({...d,date:e.target.value}))}>
                        <option value="">未定日期</option>
                        {tripDateRange.map((d,i)=>{const dt=new Date(d);return<option key={d} value={d}>Day{i+1} {dt.getMonth()+1}/{dt.getDate()}</option>;})}
                      </select>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest mb-1.5" style={{color:C.muted}}>時間</p>
                      <input type="time" value={detailData.time||''} onChange={e=>setDetailData(d=>({...d,time:e.target.value}))}
                        className="w-full border rounded-xl px-3 py-2.5 text-sm font-bold" style={{borderColor:C.border,color:C.primary}}/>
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest mb-1.5" style={{color:C.muted}}>交通方式 *</p>
                    <input value={detailData.transportMode||''} onChange={e=>setDetailData(d=>({...d,transportMode:e.target.value}))}
                      placeholder="高鐵、飛機、巴士…"
                      className="w-full border rounded-xl px-3 py-2.5 text-sm font-bold" style={{borderColor:C.border,color:C.ink}}/>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest mb-1.5" style={{color:C.muted}}>搭車地點</p>
                      <input value={detailData.from||''} onChange={e=>setDetailData(d=>({...d,from:e.target.value}))}
                        placeholder="台南火車站" className="w-full border rounded-xl px-3 py-2.5 text-sm" style={{borderColor:C.border,color:C.ink}}/>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest mb-1.5" style={{color:C.muted}}>下車地點</p>
                      <input value={detailData.to||''} onChange={e=>setDetailData(d=>({...d,to:e.target.value}))}
                        placeholder="桃園機場" className="w-full border rounded-xl px-3 py-2.5 text-sm" style={{borderColor:C.border,color:C.ink}}/>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest mb-1.5" style={{color:C.muted}}>票價</p>
                      <div className="flex gap-1">
                        <input value={detailData.price||''} onChange={e=>setDetailData(d=>({...d,price:e.target.value}))}
                          placeholder="1190" className="flex-1 border rounded-xl px-3 py-2.5 text-sm" style={{borderColor:C.border,color:C.ink}}/>
                        <select className="border rounded-xl px-2 py-2.5 text-xs font-bold shrink-0" style={{borderColor:C.border,color:C.body}}
                          value={detailData.priceCurrency||baseCurrency} onChange={e=>setDetailData(d=>({...d,priceCurrency:e.target.value}))}>
                          {Object.keys(rates).map(c=><option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest mb-1.5" style={{color:C.muted}}>預估時間</p>
                      <input value={detailData.duration||''} onChange={e=>setDetailData(d=>({...d,duration:e.target.value}))}
                        placeholder="2小時" className="w-full border rounded-xl px-3 py-2.5 text-sm" style={{borderColor:C.border,color:C.ink}}/>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest mb-1.5" style={{color:C.muted}}>班次名稱（選填）</p>
                      <input value={detailData.title||''} onChange={e=>setDetailData(d=>({...d,title:e.target.value}))}
                        placeholder="自強號" className="w-full border rounded-xl px-3 py-2.5 text-sm" style={{borderColor:C.border,color:C.ink}}/>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest mb-1.5" style={{color:C.muted}}>購票截止日</p>
                      <input type="date" value={detailData.ticketDeadline||''} onChange={e=>setDetailData(d=>({...d,ticketDeadline:e.target.value}))}
                        className="w-full border rounded-xl px-3 py-2.5 text-sm" style={{borderColor:C.border,color:C.ink}}/>
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest mb-1.5" style={{color:C.muted}}>購票連結</p>
                    <input type="url" value={detailData.url||''} onChange={e=>setDetailData(d=>({...d,url:e.target.value}))}
                      placeholder="https://..." className="w-full border rounded-xl px-3 py-2.5 text-sm" style={{borderColor:C.border,color:C.ink}}/>
                  </div>

                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={detailData.needTicket||false} onChange={e=>setDetailData(d=>({...d,needTicket:e.target.checked}))} className="w-4 h-4 rounded"/>
                    <span className="text-sm font-bold" style={{color:C.ink}}>需提前購票 → 自動加行前清單</span>
                  </label>

                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest mb-1.5" style={{color:C.muted}}>備註</p>
                    <textarea value={detailData.notes||''} onChange={e=>setDetailData(d=>({...d,notes:e.target.value}))}
                      placeholder="注意事項、換乘資訊…" rows={2}
                      className="w-full border rounded-xl px-3 py-2.5 text-sm resize-none" style={{borderColor:C.border,color:C.ink}}/>
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

            {/* 固定底部：儲存（主要）+ 刪除（次要小字） */}
            {!readOnly && (
              <div className="shrink-0 px-5 pt-3 pb-8 space-y-2" style={{borderTop:`1px solid ${C.border}`}}>
                <button
                  onClick={saveDetailSheet}
                  className="w-full py-3.5 rounded-2xl text-sm font-black text-white"
                  style={{background:C.primary}}>
                  儲存
                </button>
                <button
                  onClick={deleteFromDetail}
                  className="w-full py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5"
                  style={{background:'transparent', color:C.danger}}>
                  <Trash2 size={13}/>刪除此行程
                </button>
              </div>
            )}

          </div>
        </div>
      )}

            {/* ══ CHECKLIST SHEET ══ */}
      {sheetOpen && (
        <div className="fixed inset-0 z-[60] flex flex-col justify-end">
          <div className="absolute inset-0" style={{background:'rgba(0,0,0,0.25)'}} onClick={()=>setSheetOpen(false)}/>
          <div className="relative rounded-t-3xl pb-10"
            style={{background:C.card, boxShadow:'0 -8px 40px rgba(0,0,0,0.12)', maxWidth:'448px', width:'100%', margin:'0 auto'}}>
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 rounded-full" style={{background:C.border}}/>
            </div>
            <div className="px-5 pb-4 space-y-3">
              {/* 類型切換 */}
              <div className="flex gap-1 p-1 rounded-xl" style={{background:'#F4F7FA'}}>
                {[['item','✅ 待辦'],['memo','📝 備忘']].map(([t,l])=>(
                  <button key={t} onClick={()=>setNewCheckType(t)}
                    className="flex-1 py-2 rounded-lg text-xs font-black transition-all"
                    style={newCheckType===t?{background:C.primary,color:'#fff'}:{color:C.muted}}>
                    {l}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  ref={sheetInputRef}
                  type="text"
                  value={sheetInput}
                  onChange={e=>setSheetInput(e.target.value)}
                  onKeyDown={e=>e.key==='Enter'&&submitSheet()}
                  placeholder={newCheckType==='memo'?'輸入備忘記錄…':'輸入待準備事項…'}
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

      {/* ══ 收藏景點新增 SHEET ══ */}
      {spotModalOpen && (
        <div className="fixed inset-0 z-[60] flex flex-col justify-end">
          <div className="absolute inset-0" style={{background:'rgba(0,0,0,0.25)'}} onClick={()=>setSpotModalOpen(false)}/>
          <div className="relative rounded-t-3xl pb-10"
            style={{background:C.card, boxShadow:'0 -8px 40px rgba(0,0,0,0.12)', maxWidth:'448px', width:'100%', margin:'0 auto'}}>
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 rounded-full" style={{background:C.border}}/>
            </div>
            <div className="px-5 pb-2 space-y-3">
              <h3 className="text-base font-black" style={{color:C.ink}}>新增收藏</h3>
              <input
                autoFocus
                placeholder="景點名稱 *"
                className="w-full border rounded-2xl px-4 py-3 text-sm font-bold"
                style={{borderColor:spotModalData.name.trim()?C.primary:C.border, color:C.ink}}
                value={spotModalData.name}
                onChange={e=>setSpotModalData(d=>({...d,name:e.target.value}))}/>
              <input
                placeholder="地點（Google Maps 搜尋用，如：錦市場 京都）"
                className="w-full border rounded-2xl px-4 py-2.5 text-sm"
                style={{borderColor:C.border, color:C.ink}}
                value={spotModalData.location||''}
                onChange={e=>setSpotModalData(d=>({...d,location:e.target.value}))}/>
              <textarea
                placeholder="備註（在哪看到的、有什麼特色…）"
                className="w-full border rounded-2xl px-4 py-2.5 text-sm resize-none"
                rows={2}
                style={{borderColor:C.border, color:C.ink}}
                value={spotModalData.note||''}
                onChange={e=>setSpotModalData(d=>({...d,note:e.target.value}))}/>
              <input
                type="url"
                placeholder="來源連結 https://..."
                className="w-full border rounded-2xl px-4 py-2.5 text-sm"
                style={{borderColor:C.border, color:C.ink}}
                value={spotModalData.url||''}
                onChange={e=>setSpotModalData(d=>({...d,url:e.target.value}))}/>
              <button
                onClick={()=>{
                  if (!spotModalData.name.trim()) return;
                  setSavedSpots(p=>[...p, {
                    id: crypto.randomUUID(),
                    name: spotModalData.name.trim(),
                    location: (spotModalData.location||'').trim(),
                    note: (spotModalData.note||'').trim(),
                    url: (spotModalData.url||'').trim(),
                    createdAt: new Date().toISOString(),
                  }]);
                  setSpotModalOpen(false);
                  showToast('已收藏 ✓');
                }}
                className="w-full py-3 rounded-2xl text-sm font-black text-white"
                style={{background:spotModalData.name.trim()?C.primary:C.muted}}>
                加入收藏
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ 新增景點/交通 MODAL ══ */}
      {addItemModal && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center" style={{background:'rgba(0,0,0,0.35)'}} onClick={e=>{if(e.target===e.currentTarget){setIsSettingsOpen(false);setIsShareOpen(false);setAddItemModal(null);}}}>
          <div className="w-full rounded-t-3xl flex flex-col" style={{background:C.card, maxHeight:'85dvh', maxWidth:'448px', width:'100%'}}>
            <div className="shrink-0 flex items-center justify-between px-5 pt-5 pb-4" style={{borderBottom:`1px solid ${C.border}`}}>
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-black" style={{color:C.ink}}>新增{addItemModal.type==='place'?'景點':'交通'}</h2>
                {/* type 切換（只在新增時） */}
                <div className="flex gap-1 p-1 rounded-xl" style={{background:'#F4F7FA'}}>
                  {[['place','景點'],['transport','交通']].map(([t,l])=>(
                    <button key={t} onClick={()=>{setAddItemModal({...addItemModal,type:t});openAddItem(t,addItemModal.date);}}
                      className="px-3 py-1 rounded-lg text-xs font-black transition-all"
                      style={addItemModal.type===t?{background:C.primary,color:'#fff'}:{color:C.muted}}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={()=>setAddItemModal(null)} style={{color:C.muted}}><X size={20}/></button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
              {/* 共用：日期 + 時間 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-widest mb-1.5" style={{color:C.muted}}>日期</p>
                  <select className="w-full border rounded-2xl px-3 py-2.5 text-sm font-bold" style={{borderColor:C.border,color:C.ink}}
                    value={addItemData.date||''} onChange={e=>setAddItemData(p=>({...p,date:e.target.value}))}>
                    <option value="">未定日期</option>
                    {tripDateRange.map((d,i)=>{const dt=new Date(d);return<option key={d} value={d}>Day{i+1} {dt.getMonth()+1}/{dt.getDate()}</option>;})}
                  </select>
                </div>
                <div>
                  <p className="text-[11px] font-black uppercase tracking-widest mb-1.5" style={{color:C.muted}}>時間</p>
                  <input type="time" className="w-full border rounded-2xl px-3 py-2.5 text-sm" style={{borderColor:C.border,color:C.ink}}
                    value={addItemData.time||''} onChange={e=>setAddItemData(p=>({...p,time:e.target.value}))}/>
                </div>
              </div>

              {addItemModal.type==='place' && <>
                <div>
                  <p className="text-[11px] font-black uppercase tracking-widest mb-1.5" style={{color:C.muted}}>景點名稱 *</p>
                  <input placeholder="例如：奇美博物館" className="w-full border rounded-2xl px-4 py-3 text-sm font-bold" style={{borderColor:C.border,color:C.ink}}
                    value={addItemData.title||''} onChange={e=>setAddItemData(p=>({...p,title:e.target.value}))}/>
                </div>
                <div>
                  <p className="text-[11px] font-black uppercase tracking-widest mb-1.5" style={{color:C.muted}}>地點（供導航）</p>
                  <input placeholder="店家名稱或地址" className="w-full border rounded-2xl px-4 py-3 text-sm" style={{borderColor:C.border,color:C.ink}}
                    value={addItemData.location||''} onChange={e=>setAddItemData(p=>({...p,location:e.target.value}))}/>
                </div>
                <div>
                  <p className="text-[11px] font-black uppercase tracking-widest mb-1.5" style={{color:C.muted}}>備註</p>
                  <textarea placeholder="注意事項、行前準備…" className="w-full border rounded-2xl px-4 py-3 text-sm resize-none" rows={2} style={{borderColor:C.border,color:C.ink}}
                    value={addItemData.notes||''} onChange={e=>setAddItemData(p=>({...p,notes:e.target.value}))}/>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-widest mb-1.5" style={{color:C.muted}}>票價</p>
                    <input placeholder="門票 / 票價" className="w-full border rounded-2xl px-3 py-2.5 text-sm" style={{borderColor:C.border,color:C.ink}}
                      value={addItemData.tickets||''} onChange={e=>setAddItemData(p=>({...p,tickets:e.target.value}))}/>
                  </div>
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-widest mb-1.5" style={{color:C.muted}}>營業時間</p>
                    <input placeholder="09:00–18:00" className="w-full border rounded-2xl px-3 py-2.5 text-sm" style={{borderColor:C.border,color:C.ink}}
                      value={addItemData.hours||''} onChange={e=>setAddItemData(p=>({...p,hours:e.target.value}))}/>
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-black uppercase tracking-widest mb-1.5" style={{color:C.muted}}>網站</p>
                  <input type="url" placeholder="https://..." className="w-full border rounded-2xl px-4 py-3 text-sm" style={{borderColor:C.border,color:C.ink}}
                    value={addItemData.website||''} onChange={e=>setAddItemData(p=>({...p,website:e.target.value}))}/>
                </div>
              </>}

              {addItemModal.type==='transport' && <>
                <div>
                  <p className="text-[11px] font-black uppercase tracking-widest mb-1.5" style={{color:C.muted}}>交通方式 *</p>
                  <input placeholder="高鐵、飛機、巴士…" className="w-full border rounded-2xl px-4 py-3 text-sm font-bold" style={{borderColor:C.border,color:C.ink}}
                    value={addItemData.transportMode||''} onChange={e=>setAddItemData(p=>({...p,transportMode:e.target.value}))}/>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-widest mb-1.5" style={{color:C.muted}}>搭車地點</p>
                    <input placeholder="台南火車站" className="w-full border rounded-2xl px-3 py-2.5 text-sm" style={{borderColor:C.border,color:C.ink}}
                      value={addItemData.from||''} onChange={e=>setAddItemData(p=>({...p,from:e.target.value}))}/>
                  </div>
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-widest mb-1.5" style={{color:C.muted}}>下車地點</p>
                    <input placeholder="桃園機場" className="w-full border rounded-2xl px-3 py-2.5 text-sm" style={{borderColor:C.border,color:C.ink}}
                      value={addItemData.to||''} onChange={e=>setAddItemData(p=>({...p,to:e.target.value}))}/>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-widest mb-1.5" style={{color:C.muted}}>預估時間</p>
                    <input placeholder="2小時" className="w-full border rounded-2xl px-3 py-2.5 text-sm" style={{borderColor:C.border,color:C.ink}}
                      value={addItemData.duration||''} onChange={e=>setAddItemData(p=>({...p,duration:e.target.value}))}/>
                  </div>
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-widest mb-1.5" style={{color:C.muted}}>班次名稱（選填）</p>
                    <input placeholder="自強號" className="w-full border rounded-2xl px-3 py-2.5 text-sm" style={{borderColor:C.border,color:C.ink}}
                      value={addItemData.title||''} onChange={e=>setAddItemData(p=>({...p,title:e.target.value}))}/>
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-black uppercase tracking-widest mb-1.5" style={{color:C.muted}}>票價</p>
                  <div className="flex gap-2">
                    <input placeholder="1190" className="flex-1 border rounded-2xl px-4 py-2.5 text-sm" style={{borderColor:C.border,color:C.ink}}
                      value={addItemData.price||''} onChange={e=>setAddItemData(p=>({...p,price:e.target.value}))}/>
                    <select className="border rounded-2xl px-3 py-2.5 text-sm font-bold shrink-0" style={{borderColor:C.border,color:C.body,minWidth:'76px'}}
                      value={addItemData.priceCurrency||baseCurrency} onChange={e=>setAddItemData(p=>({...p,priceCurrency:e.target.value}))}>
                      {Object.keys(rates).map(c=><option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-widest mb-1.5" style={{color:C.muted}}>購票截止日</p>
                    <input type="date" className="w-full border rounded-2xl px-3 py-2.5 text-sm" style={{borderColor:C.border,color:C.ink}}
                      value={addItemData.ticketDeadline||''} onChange={e=>setAddItemData(p=>({...p,ticketDeadline:e.target.value}))}/>
                  </div>
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-widest mb-1.5" style={{color:C.muted}}>購票連結</p>
                    <input type="url" placeholder="https://" className="w-full border rounded-2xl px-3 py-2.5 text-sm" style={{borderColor:C.border,color:C.ink}}
                      value={addItemData.url||''} onChange={e=>setAddItemData(p=>({...p,url:e.target.value}))}/>
                  </div>
                </div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={addItemData.needTicket||false} onChange={e=>setAddItemData(p=>({...p,needTicket:e.target.checked}))} className="w-4 h-4 rounded accent-[#48749E]"/>
                  <span className="text-sm font-bold" style={{color:C.ink}}>需提前購票 → 自動加行前清單</span>
                </label>
                <div>
                  <p className="text-[11px] font-black uppercase tracking-widest mb-1.5" style={{color:C.muted}}>備註</p>
                  <textarea placeholder="注意事項..." className="w-full border rounded-2xl px-4 py-3 text-sm resize-none" rows={2} style={{borderColor:C.border,color:C.ink}}
                    value={addItemData.notes||''} onChange={e=>setAddItemData(p=>({...p,notes:e.target.value}))}/>
                </div>
              </>}
            </div>
            <div className="shrink-0 px-5 pt-3 pb-8" style={{borderTop:`1px solid ${C.border}`}}>
              <button onClick={saveAddItem}
                disabled={addItemModal.type==='place'?!addItemData.title?.trim():!addItemData.transportMode?.trim()}
                className="w-full py-3.5 rounded-2xl text-sm font-black text-white transition-all"
                style={{background:((addItemModal.type==='place'&&addItemData.title?.trim())||(addItemModal.type==='transport'&&addItemData.transportMode?.trim()))?C.primary:C.muted}}>
                新增{addItemModal.type==='place'?'景點':'交通'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ 設定 MODAL ══ */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center" style={{background:'rgba(0,0,0,0.35)'}} onClick={e=>{if(e.target===e.currentTarget){setIsSettingsOpen(false);setIsShareOpen(false);setAddItemModal(null);}}}>
          <div className="w-full rounded-t-3xl flex flex-col" style={{background:C.card, maxHeight:'90dvh', maxWidth:'448px', width:'100%'}}>
            <div className="shrink-0 flex items-center justify-between px-5 pt-5 pb-4" style={{borderBottom:`1px solid ${C.border}`}}>
              <h2 className="text-lg font-black" style={{color:C.ink}}>系統設定</h2>
              <button onClick={()=>setIsSettingsOpen(false)} style={{color:C.muted}}><X size={20}/></button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-5 space-y-8">

              {/* 人員 */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[11px] font-black uppercase tracking-widest" style={{color:C.muted}}>參與人員</p>
                  <button onClick={()=>{setIsUsersLocked(v=>!v);setEditingUserId(null);}} className="flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg" style={{background:'#F4F7FA',color:isUsersLocked?C.muted:C.danger}}>
                    {isUsersLocked?<><Lock size={11}/>鎖定</>:<><Unlock size={11}/>編輯中</>}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 mb-3">
                  {users.map((u,i)=>(
                    <div key={u} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold" style={{background:i===0?C.primaryLight:'#F4F7FA',color:i===0?C.primary:C.body,border:`1px solid ${i===0?C.primary+'33':C.border}`}}>
                      {i===0&&<span className="mr-0.5">👑</span>}
                      {!isUsersLocked && editingUserId===u ? (
                        <div className="flex items-center gap-1">
                          <input autoFocus value={editUserValue} onChange={e=>setEditUserValue(e.target.value)}
                            onKeyDown={e=>e.key==='Enter'&&saveEditedUser(u)}
                            className="w-20 bg-transparent border-b text-sm" style={{borderColor:C.primary,color:C.ink}}/>
                          <button onClick={()=>saveEditedUser(u)} className="p-0.5 rounded-md" style={{background:C.primary,color:'#fff'}}><Check size={13}/></button>
                          <button onClick={()=>setEditingUserId(null)} className="p-0.5 rounded-md" style={{background:'#F4F7FA',color:C.muted}}><X size={13}/></button>
                        </div>
                      ) : (
                        <>
                          <span>{u}</span>
                          {!isUsersLocked&&(
                            <div className="flex items-center gap-0.5 ml-1">
                              <button onClick={()=>{setEditingUserId(u);setEditUserValue(u);}} style={{color:C.muted}}><Edit2 size={12}/></button>
                              {i>0&&<button onClick={()=>removeUser(u,i)} style={{color:C.danger+'99'}}><X size={12}/></button>}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
                {!isUsersLocked&&(
                  <div className="flex gap-2">
                    <input value={newUser} onChange={e=>setNewUser(e.target.value)} placeholder="新成員名字..." className="flex-1 border rounded-2xl px-3 py-2 text-sm" style={{borderColor:C.border,color:C.ink}} onKeyDown={e=>e.key==='Enter'&&addUser()}/>
                    <button onClick={addUser} className="px-4 py-2 rounded-2xl text-sm font-black text-white" style={{background:C.primary}}>新增</button>
                  </div>
                )}
              </div>

              {/* 記帳分類 */}
              <div>
                <p className="text-[11px] font-black uppercase tracking-widest mb-3" style={{color:C.muted}}>記帳分類</p>
                <div className="flex flex-wrap gap-2 mb-3">
                  {categories.map(c=>(
                    <div key={c} className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold" style={{background:C.primaryLight,color:C.primary}}>
                      {editingCatId===c ? (
                        <div className="flex items-center gap-1">
                          <input autoFocus value={editCatValue} onChange={e=>setEditCatValue(e.target.value)}
                            onKeyDown={e=>e.key==='Enter'&&saveEditedCat(c)}
                            className="w-16 bg-transparent border-b text-xs" style={{borderColor:C.primary,color:C.primary}}/>
                          <button onClick={()=>saveEditedCat(c)} className="p-0.5 rounded-md" style={{background:C.primary,color:'#fff'}}><Check size={11}/></button>
                          <button onClick={()=>setEditingCatId(null)} className="p-0.5 rounded-md" style={{background:'#F4F7FA',color:C.muted}}><X size={11}/></button>
                        </div>
                      ) : (
                        <>
                          <span>{c}</span>
                          <button onClick={()=>{setEditingCatId(c);setEditCatValue(c);}} style={{color:C.primary+'88'}}><Edit2 size={10}/></button>
                          <button onClick={()=>removeCat(c)} style={{color:C.primary+'88'}}><X size={11}/></button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input value={newCategory} onChange={e=>setNewCategory(e.target.value)} placeholder="新增分類..." className="flex-1 border rounded-2xl px-3 py-2 text-sm" style={{borderColor:C.border,color:C.ink}} onKeyDown={e=>e.key==='Enter'&&addCategory()}/>
                  <button onClick={addCategory} className="px-4 py-2 rounded-2xl text-sm font-black text-white" style={{background:C.primary}}>新增</button>
                </div>
              </div>

              {/* 匯率 */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[11px] font-black uppercase tracking-widest" style={{color:C.muted}}>匯率設定</p>
                  <span className="text-xs font-bold" style={{color:C.muted}}>基準：{baseCurrency}</span>
                </div>
                <div className="space-y-2 mb-3">
                  {Object.entries(rates).map(([c,r])=>(
                    <div key={c} className="flex items-center gap-2 px-3 py-2 rounded-2xl" style={{background:c===baseCurrency?C.primaryLight:'#F4F7FA',border:`1px solid ${c===baseCurrency?C.primary+'33':C.border}`}}>
                      {c===baseCurrency&&<Star size={12} style={{color:C.primary}}/>}
                      <span className="text-sm font-bold w-12" style={{color:c===baseCurrency?C.primary:C.ink}}>1 {c}</span>
                      <span className="text-xs" style={{color:C.muted}}>=</span>
                      <input type="number" step="0.0001" className="flex-1 text-sm text-right bg-transparent border-none" style={{color:C.ink}}
                        value={r} disabled={c===baseCurrency}
                        onChange={e=>updateRate(c, e.target.value)}/>
                      <span className="text-xs" style={{color:C.muted}}>{baseCurrency}</span>
                      {c!==baseCurrency&&<>
                        <button onClick={()=>setBaseCurrency(c)} title="設為基準"><Star size={14} style={{color:C.muted}}/></button>
                        <button onClick={()=>removeRate(c)}><X size={14} style={{color:C.muted}}/></button>
                      </>}
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input value={newCurrency} onChange={e=>setNewCurrency(e.target.value.toUpperCase())} placeholder="幣別 (JPY)" maxLength={3} className="w-24 border rounded-2xl px-3 py-2 text-sm uppercase" style={{borderColor:C.border,color:C.ink}}/>
                  <input type="number" step="0.001" value={newRateValue} onChange={e=>setNewRateValue(e.target.value)} placeholder={`1幣=?${baseCurrency}`} className="flex-1 border rounded-2xl px-3 py-2 text-sm" style={{borderColor:C.border,color:C.ink}}/>
                  <button onClick={addRate} className="px-3 py-2 rounded-2xl text-sm font-black text-white" style={{background:C.primary}}>新增</button>
                </div>
              </div>

              {/* 住宿設定 */}
              <div>
                <p className="text-[11px] font-black uppercase tracking-widest mb-3" style={{color:C.muted}}>住宿設定</p>
                <div className="space-y-2 mb-3">
                  {accommodations.length===0&&<p className="text-xs" style={{color:C.muted}}>尚未設定住宿</p>}
                  {accommodations.map((a,i)=>(
                    <div key={i}>
                      {editingAccomIdx===i ? (
                        <div className="space-y-2 p-3 rounded-2xl" style={{background:'#F4F7FA',border:`1px solid ${C.primary}44`}}>
                          {/* 日期：改用 input type=text 避免 date picker 爆出設定框 */}
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <p className="text-[10px] font-black uppercase mb-1" style={{color:C.muted}}>入住日</p>
                              <input type="date" className="w-full border rounded-xl px-2 py-1.5 text-xs" style={{borderColor:C.border,color:C.ink,maxWidth:'100%'}} value={a.checkIn||''} onChange={e=>setAccommodations(p=>p.map((x,j)=>j===i?{...x,checkIn:e.target.value,date:e.target.value}:x))}/>
                            </div>
                            <div>
                              <p className="text-[10px] font-black uppercase mb-1" style={{color:C.muted}}>退房日</p>
                              <input type="date" className="w-full border rounded-xl px-2 py-1.5 text-xs" style={{borderColor:C.border,color:C.ink,maxWidth:'100%'}} value={a.checkOut||''} onChange={e=>setAccommodations(p=>p.map((x,j)=>j===i?{...x,checkOut:e.target.value}:x))}/>
                            </div>
                          </div>
                          <input placeholder="住宿名稱" className="w-full border rounded-xl px-3 py-1.5 text-sm" style={{borderColor:C.border,color:C.ink}} value={a.name||''} onChange={e=>setAccommodations(p=>p.map((x,j)=>j===i?{...x,name:e.target.value}:x))}/>
                          <input placeholder="地址（供導航）" className="w-full border rounded-xl px-3 py-1.5 text-sm" style={{borderColor:C.border,color:C.ink}} value={a.location||''} onChange={e=>setAccommodations(p=>p.map((x,j)=>j===i?{...x,location:e.target.value}:x))}/>
                          <div className="flex gap-2">
                            <input placeholder="金額（選填）" type="number" className="flex-1 border rounded-xl px-3 py-1.5 text-sm" style={{borderColor:C.border,color:C.ink}} value={a.price||''} onChange={e=>setAccommodations(p=>p.map((x,j)=>j===i?{...x,price:e.target.value}:x))}/>
                            <select className="border rounded-xl px-2 py-1.5 text-sm" style={{borderColor:C.border,color:C.ink}} value={a.currency||baseCurrency} onChange={e=>setAccommodations(p=>p.map((x,j)=>j===i?{...x,currency:e.target.value}:x))}>
                              {Object.keys(rates).map(cur=><option key={cur}>{cur}</option>)}
                            </select>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={()=>setEditingAccomIdx(null)} className="flex-1 py-1.5 rounded-xl text-xs font-black text-white" style={{background:C.primary}}>完成</button>
                            <button onClick={()=>{setAccommodations(p=>p.filter((_,j)=>j!==i));setEditingAccomIdx(null);}} className="px-4 py-1.5 rounded-xl text-xs font-black" style={{background:C.dangerLight,color:C.danger}}>刪除</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 px-3 py-2 rounded-2xl" style={{background:C.primaryLight,border:`1px solid ${C.primary}33`}}>
                          <Hotel size={14} style={{color:C.primary}}/>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-bold" style={{color:C.primary}}>{a.checkIn}～{a.checkOut}</div>
                            <div className="text-sm font-bold truncate" style={{color:C.ink}}>{a.name}</div>
                            {a.price&&<div className="text-xs" style={{color:C.muted}}>{a.currency||baseCurrency} {Number(a.price).toLocaleString()}</div>}
                            {a.location&&<div className="text-xs truncate" style={{color:C.muted}}>{a.location}</div>}
                          </div>
                          <button onClick={()=>setEditingAccomIdx(i)} className="p-1.5 rounded-lg" style={{background:'rgba(72,116,158,0.1)',color:C.primary}}><Edit2 size={13}/></button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {!showAddAccom?(
                  <button onClick={()=>setShowAddAccom(true)} className="w-full py-2 rounded-2xl text-sm font-black border-2 border-dashed" style={{borderColor:C.primary+'44',color:C.primary}}>+ 新增住宿</button>
                ):(
                  <div className="space-y-3 p-4 rounded-2xl" style={{background:'#F4F7FA',border:`1px solid ${C.border}`}}>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-[10px] font-black uppercase mb-1" style={{color:C.muted}}>入住日</p>
                        <input type="date" className="w-full border rounded-xl px-2 py-2 text-xs" style={{borderColor:C.border,color:C.ink,maxWidth:'100%'}} value={newAccomCheckIn} onChange={e=>setNewAccomCheckIn(e.target.value)}/>
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase mb-1" style={{color:C.muted}}>退房日</p>
                        <input type="date" className="w-full border rounded-xl px-2 py-2 text-xs" style={{borderColor:C.border,color:C.ink,maxWidth:'100%'}} value={newAccomCheckOut} onChange={e=>setNewAccomCheckOut(e.target.value)}/>
                      </div>
                    </div>
                    <input placeholder="住宿名稱" className="w-full border rounded-xl px-3 py-2 text-sm" style={{borderColor:C.border,color:C.ink}} value={newAccomName} onChange={e=>setNewAccomName(e.target.value)}/>
                    <input placeholder="地址（供導航）" className="w-full border rounded-xl px-3 py-2 text-sm" style={{borderColor:C.border,color:C.ink}} value={newAccomLoc} onChange={e=>setNewAccomLoc(e.target.value)}/>
                    <div className="flex gap-2">
                      <input placeholder="金額（選填）" type="number" className="flex-1 border rounded-xl px-3 py-2 text-sm" style={{borderColor:C.border,color:C.ink}} value={newAccomPrice} onChange={e=>setNewAccomPrice(e.target.value)}/>
                      <select className="border rounded-xl px-2 py-2 text-sm" style={{borderColor:C.border,color:C.ink}} value={newAccomCur||baseCurrency} onChange={e=>setNewAccomCur(e.target.value)}>
                        {Object.keys(rates).map(cur=><option key={cur}>{cur}</option>)}
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={()=>{setShowAddAccom(false);setNewAccomName('');setNewAccomLoc('');setNewAccomCheckIn('');setNewAccomCheckOut('');setNewAccomPrice('');setNewAccomCur('');}} className="flex-1 py-2 rounded-xl text-sm font-bold" style={{background:'#F4F7FA',color:C.muted}}>取消</button>
                      <button onClick={()=>{
                        if(!newAccomName.trim()) return;
                        const cur = newAccomCur||baseCurrency;
                        const price = Number(newAccomPrice)||0;
                        const newAccom = {checkIn:newAccomCheckIn,checkOut:newAccomCheckOut,name:newAccomName.trim(),location:newAccomLoc.trim(),date:newAccomCheckIn,price:newAccomPrice,currency:cur};
                        setAccommodations(p=>[...p,newAccom].sort((a,b)=>a.checkIn.localeCompare(b.checkIn)));
                        // 有填金額 → 自動建立住宿花費
                        if (price>0) {
                          const nights = newAccomCheckIn&&newAccomCheckOut ? Math.max(1,Math.round((new Date(newAccomCheckOut)-new Date(newAccomCheckIn))/(1000*60*60*24))) : 1;
                          setExpenses(prev=>[...prev,{
                            id: crypto.randomUUID(),
                            description: `${newAccomName.trim()} 住宿費`,
                            amount: price,
                            currency: cur,
                            category: '住宿',
                            paidBy: users[0]||'',
                            splitMode: 'equal',
                            splitAmong: [...users],
                            items: [{name:`${newAccomName.trim()}（${nights}晚）`,amount:price}],
                            createdAt: new Date().toISOString(),
                          }]);
                          showToast(`✅ 已自動建立住宿花費 ${cur} ${price.toLocaleString()}`);
                        }
                        setShowAddAccom(false);setNewAccomName('');setNewAccomLoc('');setNewAccomCheckIn('');setNewAccomCheckOut('');setNewAccomPrice('');setNewAccomCur('');
                      }} className="flex-1 py-2 rounded-xl text-sm font-black text-white" style={{background:C.primary}}>新增</button>
                    </div>
                  </div>
                )}
              </div>

              {/* Markdown 匯入／匯出 */}
              <div>
                <p className="text-[11px] font-black uppercase tracking-widest mb-1" style={{color:C.muted}}>行程 Markdown</p>
                <p className="text-xs mb-3" style={{color:C.muted}}>支援行程、住宿、收藏景點、必帶物品，可直接貼給 AI 請它規劃</p>
                {/* 匯出 */}
                <button onClick={()=>{exportMarkdown();}} className="w-full py-2.5 rounded-2xl text-sm font-black text-white mb-2" style={{background:C.primary}}>
                  📤 匯出 Markdown（給 AI 用）
                </button>
                {/* 匯入 */}
                {!isMarkdownOpen?(
                  <button onClick={()=>setIsMarkdownOpen(true)} className="w-full py-2.5 rounded-2xl text-sm font-black" style={{background:C.primaryLight,color:C.primary}}>📋 貼上 Markdown 匯入</button>
                ):(
                  <div className="space-y-3">
                    <textarea value={markdownText} onChange={e=>setMarkdownText(e.target.value)} placeholder="在此貼上 Markdown 行程..." className="w-full border rounded-2xl px-4 py-3 text-sm resize-none" rows={8} style={{borderColor:C.border,color:C.ink}}/>
                    {markdownStatus&&<p className="text-xs font-bold" style={{color:C.primary}}>{markdownStatus}</p>}
                    <div className="flex gap-2">
                      <button onClick={()=>{setIsMarkdownOpen(false);setMarkdownStatus('');}} className="flex-1 py-2.5 rounded-2xl text-sm font-bold" style={{background:'#F4F7FA',color:C.muted}}>取消</button>
                      <button onClick={handleMarkdownImport} className="flex-1 py-2.5 rounded-2xl text-sm font-black text-white" style={{background:C.primary}}>匯入</button>
                    </div>
                  </div>
                )}
              </div>

              {/* 版本號 */}
              <div className="text-center pb-2">
                <span className="text-xs font-mono" style={{color:C.muted}}>v0.8.2</span>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* ══ 分享 MODAL ══ */}
      {isShareOpen && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center" style={{background:'rgba(0,0,0,0.35)'}} onClick={e=>{if(e.target===e.currentTarget){setIsSettingsOpen(false);setIsShareOpen(false);setAddItemModal(null);}}}>
          <div className="w-full rounded-t-3xl flex flex-col" style={{background:C.card, maxHeight:'80dvh', maxWidth:'448px', width:'100%'}}>
            <div className="shrink-0 flex items-center justify-between px-5 pt-5 pb-4" style={{borderBottom:`1px solid ${C.border}`}}>
              <h2 className="text-lg font-black" style={{color:C.ink}}>分享行程</h2>
              <button onClick={()=>{setIsShareOpen(false);setShareStatus('');}} style={{color:C.muted}}><X size={20}/></button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-5 space-y-5">
              <div className="space-y-3">
                <input type="email" placeholder="輸入對方 Gmail..." value={newShareEmail} onChange={e=>{setNewShareEmail(e.target.value);setShareStatus('');}}
                  className="w-full border rounded-2xl px-4 py-3 text-sm" style={{borderColor:C.border,color:C.ink}}/>
                <div className="flex gap-2">
                  {[['viewer','👁 只能查看'],['editor','✏️ 可以編輯']].map(([r,l])=>(
                    <button key={r} onClick={()=>setNewShareRole(r)} className="flex-1 py-2.5 rounded-2xl text-sm font-black"
                      style={newShareRole===r?{background:C.primary,color:'#fff'}:{background:'#F4F7FA',color:C.muted,border:`1px solid ${C.border}`}}>{l}</button>
                  ))}
                </div>
                <button onClick={addShareMember} className="w-full py-3 rounded-2xl text-sm font-black text-white" style={{background:C.primary}}>新增成員</button>
                {shareStatus&&<p className="text-sm text-center font-bold" style={{color:C.primary}}>{shareStatus}</p>}
              </div>
              {(shareEditors.length>0||shareViewers.length>0)&&(
                <div className="space-y-2">
                  <p className="text-[11px] font-black uppercase tracking-widest" style={{color:C.muted}}>目前成員</p>
                  {shareEditors.map(u=><div key={u} className="flex items-center justify-between px-3 py-2 rounded-2xl" style={{background:C.primaryLight}}><span className="text-sm font-bold" style={{color:C.primary}}>✏️ {shareEmailMap[u]||u}</span><button onClick={()=>setShareEditors(p=>p.filter(x=>x!==u))} style={{color:C.muted}}><X size={14}/></button></div>)}
                  {shareViewers.map(u=><div key={u} className="flex items-center justify-between px-3 py-2 rounded-2xl" style={{background:'#F4F7FA'}}><span className="text-sm font-bold" style={{color:C.body}}>👁 {shareEmailMap[u]||u}</span><button onClick={()=>setShareViewers(p=>p.filter(x=>x!==u))} style={{color:C.muted}}><X size={14}/></button></div>)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ 購物項目新增 SHEET ══ */}
      {shopAddSheet && (
        <div className="fixed inset-0 z-[70] flex flex-col justify-end"
          style={{background:'rgba(0,0,0,0.35)'}}
          onClick={e=>{ if(e.target===e.currentTarget){setShopAddSheet(null);setShopAddText('');} }}>
          <div className="w-full rounded-t-3xl flex flex-col"
            style={{background:C.card, maxWidth:'448px', margin:'0 auto', boxShadow:'0 -8px 40px rgba(0,0,0,0.15)'}}>
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 rounded-full" style={{background:C.border}}/>
            </div>

            {/* 選景點（FAB 點擊且有多個景點時） */}
            {shopAddSheet==='pick' ? (
              <div className="px-5 pb-8">
                <p className="text-sm font-black mb-3" style={{color:C.ink}}>要加入哪個景點的購物清單？</p>
                <div className="space-y-2 overflow-y-auto" style={{maxHeight:'50vh'}}>
                  {itinerary.filter(i=>i.type==='place').map(item=>(
                    <button key={item.id} onClick={()=>setShopAddSheet(item.id)}
                      className="w-full text-left px-4 py-3 rounded-2xl flex items-center gap-2"
                      style={{background:C.primaryLight}}>
                      <MapPin size={14} style={{color:C.primary}}/>
                      <span className="flex-1 text-sm font-bold" style={{color:C.ink}}>{item.title}</span>
                      <span className="text-xs shrink-0" style={{color:C.muted}}>{fmtDate(item.date)}</span>
                    </button>
                  ))}
                </div>
                <button onClick={()=>{setShopAddSheet(null);}} className="mt-3 w-full py-2.5 rounded-2xl text-sm font-bold" style={{background:'#F4F7FA',color:C.muted}}>取消</button>
              </div>
            ) : (
              /* 輸入購物項目 */
              <div className="px-5 pb-8">
                {(() => {
                  const item = itinerary.find(i=>i.id===shopAddSheet);
                  return item && <p className="text-xs font-bold mb-2" style={{color:C.primary}}>📍 {item.title}</p>;
                })()}
                <p className="text-sm font-black mb-3" style={{color:C.ink}}>新增購物項目</p>
                <div className="flex gap-2">
                  <input
                    ref={shopAddRef}
                    type="text"
                    value={shopAddText}
                    onChange={e=>setShopAddText(e.target.value)}
                    onKeyDown={e=>{
                      if (e.key==='Enter' && shopAddText.trim()) {
                        setItinerary(list=>list.map(i=>i.id===shopAddSheet
                          ? {...i, shoppingList:[...(i.shoppingList||[]),{id:crypto.randomUUID(),text:shopAddText.trim(),checked:false}]}
                          : i));
                        setShopAddText('');
                      }
                    }}
                    placeholder="輸入購物項目…"
                    className="flex-1 border rounded-2xl px-4 py-3 text-sm"
                    style={{borderColor:C.border, color:C.ink}}/>
                  <button
                    onClick={()=>{
                      if (!shopAddText.trim()) return;
                      setItinerary(list=>list.map(i=>i.id===shopAddSheet
                        ? {...i, shoppingList:[...(i.shoppingList||[]),{id:crypto.randomUUID(),text:shopAddText.trim(),checked:false}]}
                        : i));
                      setShopAddText('');
                    }}
                    className="fab px-4 rounded-2xl font-black text-white"
                    style={{background:shopAddText.trim()?C.primary:C.muted, transition:'background 0.15s'}}>
                    <Plus size={20}/>
                  </button>
                </div>
                <button onClick={()=>{setShopAddSheet(null);setShopAddText('');}}
                  className="mt-3 w-full py-2.5 rounded-2xl text-sm font-bold" style={{background:'#F4F7FA',color:C.muted}}>完成</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ EXPENSE MODALS ══ */}
      {addingExpenseFor && <ExpenseFormModal expenseItem={addingExpenseFor} users={users} rates={rates} baseCurrency={baseCurrency} categories={categories} onSave={saveExpense} onClose={()=>setAddingExpenseFor(null)}/>}
      {editingExpense && <ExpenseFormModal key={`edit-${editingExpense.id}`} initialData={editingExpense} expenseItem={itinerary.find(i=>i.id===editingExpense.itineraryId)||{title:'一般花費'}} users={users} rates={rates} baseCurrency={baseCurrency} categories={categories} onSave={saveExpense} onClose={()=>setEditingExpense(null)}/>}
      {ConfirmUI}

      {/* ══ BOTTOM NAV ══ */}
      <nav style={{
        position:'fixed',
        bottom:0,
        left:'50%',
        transform:'translateX(-50%)',
        width:'100%',
        maxWidth:'448px',
        background:C.primary,
        paddingBottom:'env(safe-area-inset-bottom, 0px)',
        zIndex:40,
      }}>
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
