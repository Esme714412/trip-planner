import { useState } from 'react';
import { collection, addDoc, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { db, auth } from '../firebase/config';
import { Plus, Trash2, LogOut, Users, Edit2, Check, X, Calendar, Plane, MapPin, Luggage, Camera, FileText } from 'lucide-react';
import { parseMarkdown } from '../utils/parseMarkdown';

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
  cardShadow:   '0 2px 12px rgba(72,116,158,0.08), 0 1px 3px rgba(0,0,0,0.04)',
};

const TRIP_ICONS = [Plane, MapPin, Luggage, Camera];
const ICON_EMOJIS = ['✈️', '🗺️', '🎒', '📸', '🏖️', '🏔️', '🌏', '🍜'];

const DEFAULT_TRIP = {
  iconIndex: 0,
  categories: ['飲食', '交通', '住宿', '購物', '娛樂', '門票', '其他'],
  rates: { TWD: 1, JPY: 0.21, USD: 31.5 },
  baseCurrency: 'TWD',
  checklist: [],
  itinerary: [],
  expenses: [],
};

function fmtShort(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getMonth()+1}/${d.getDate()}`;
}

function tripDays(s, e) {
  if (!s || !e) return null;
  const diff = (new Date(e) - new Date(s)) / (1000*60*60*24);
  return diff >= 0 ? Math.round(diff) + 1 : null;
}

export default function TripSelector({ uid, userProfile, trips, sharedTrips, onSelect }) {
  const [creating,          setCreating]          = useState(false);
  const [createMode,        setCreateMode]        = useState('manual'); // 'manual' | 'markdown'
  const [mdImportText,      setMdImportText]      = useState('');
  const [mdPreview,         setMdPreview]         = useState(null); // parsed preview
  const [newName,           setNewName]            = useState('');
  const [startDate,         setStartDate]          = useState('');
  const [endDate,           setEndDate]            = useState('');
  const [isEditingNickname, setIsEditingNickname]  = useState(false);
  const [nicknameInput,     setNicknameInput]      = useState('');
  const [deletingTrip,      setDeletingTrip]       = useState(null);
  const [deleteInput,       setDeleteInput]        = useState('');

  const displayNickname = userProfile?.nickname
    || userProfile?.displayName
    || userProfile?.email?.split('@')[0]
    || '我';

  const saveNickname = async () => {
    const name = nicknameInput.trim();
    if (!name) return;
    await updateDoc(doc(db, 'userProfiles', uid), { nickname: name });
    setIsEditingNickname(false);
  };

  const handleCreate = async () => {
    const name = newName.trim() || '新旅程';
    const myName = userProfile?.nickname || userProfile?.displayName || userProfile?.email?.split('@')[0] || '自己';
    await addDoc(collection(db, 'users', uid, 'trips'), {
      ...DEFAULT_TRIP,
      name,
      users: [myName],
      tripStartDate: startDate || '',
      tripEndDate:   endDate   || '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }).then(ref => {
      setCreating(false); setNewName(''); setStartDate(''); setEndDate('');
      onSelect(ref.id);
    });
  };

  const handleMdPreview = () => {
    if (!mdImportText.trim()) return;
    const result = parseMarkdown(mdImportText);
    setMdPreview(result);
  };

  const handleCreateFromMarkdown = async () => {
    if (!mdPreview) return;
    const myName = userProfile?.nickname || userProfile?.displayName || userProfile?.email?.split('@')[0] || '自己';
    const name = mdPreview.tripName || '新旅程';
    const sDate = mdPreview.tripStartDate || '';
    const eDate = mdPreview.tripEndDate   || '';
    const currency = mdPreview.baseCurrency || 'TWD';

    // 把 needTicket 的交通項目自動產生 checklist ticket
    const autoTickets = [];
    mdPreview.itineraryItems.forEach(item => {
      if (item.type === 'transport' && item.needTicket) {
        const label = [item.transportMode, item.from && item.to ? `${item.from}→${item.to}` : ''].filter(Boolean).join(' ');
        autoTickets.push({
          id: crypto.randomUUID(),
          type: 'ticket',
          text: `購票：${label || '交通票'}`,
          checked: false,
          itineraryId: item.id,
          ticketDeadline: item.ticketDeadline || '',
          ticketMode: item.transportMode || '',
          ticketDest: item.to || '',
        });
      }
    });

    const ref = await addDoc(collection(db, 'users', uid, 'trips'), {
      ...DEFAULT_TRIP,
      name,
      users: [myName],
      tripStartDate: sDate,
      tripEndDate:   eDate,
      baseCurrency:  currency,
      rates: currency !== 'TWD' ? { TWD: 1, [currency]: 1, JPY: 0.21, USD: 31.5 } : DEFAULT_TRIP.rates,
      itinerary:      mdPreview.itineraryItems,
      checklist:      [...mdPreview.checklistItems, ...autoTickets],
      accommodations: mdPreview.accommodationItems,
      savedSpots:     mdPreview.savedSpotItems,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    setCreating(false); setMdImportText(''); setMdPreview(null); setCreateMode('manual');
    onSelect(ref.id);
  };

  const handleDeleteConfirm = async () => {
    if (deleteInput !== deletingTrip.name) return;
    await deleteDoc(doc(db, 'users', uid, 'trips', deletingTrip.id));
    setDeletingTrip(null); setDeleteInput('');
  };

  const days = tripDays(startDate, endDate);

  // ── Shared label helper ──────────────────────────────────────────────────
  const RoleBadge = ({ role }) => (
    <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
      style={role==='editor'
        ? {background:C.primaryLight, color:C.primary}
        : {background:'#F4F7FA', color:C.muted}}>
      {role==='editor' ? '✏️ 可編輯' : '👁 只能查看'}
    </span>
  );

  return (
    <div className="min-h-screen p-5" style={{background:'#F4F7FA', fontFamily:"'DM Sans','Noto Sans TC',sans-serif"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;900&display=swap');`}</style>

      <div className="max-w-sm mx-auto pt-12">

        {/* ── Header ── */}
        <div className="flex justify-between items-center mb-5">
          <div>
            <h1 className="text-2xl font-black" style={{color:C.ink, letterSpacing:'-0.03em'}}>我的旅程</h1>
            <p className="text-sm mt-0.5" style={{color:C.muted}}>選擇或建立一趟旅行</p>
          </div>
          <button onClick={()=>signOut(auth)}
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl transition-all active:scale-95"
            style={{background:C.card, color:C.muted, border:`1px solid ${C.border}`, boxShadow:C.cardShadow}}>
            <LogOut size={13}/> 登出
          </button>
        </div>

        {/* ── 暱稱卡片 ── */}
        <div className="rounded-2xl p-4 mb-5 flex items-center justify-between"
          style={{background:C.card, border:`1px solid ${C.border}`, boxShadow:C.cardShadow}}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-base font-black shrink-0"
              style={{background:C.primaryLight, color:C.primary}}>
              {displayNickname[0]?.toUpperCase() || '我'}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] mb-0.5" style={{color:C.muted}}>顯示於行程參與人員</p>
              {isEditingNickname ? (
                <div className="flex items-center gap-1.5">
                  <input autoFocus type="text" value={nicknameInput}
                    onChange={e=>setNicknameInput(e.target.value)}
                    onKeyDown={e=>e.key==='Enter'&&saveNickname()}
                    className="border-b text-sm font-black bg-transparent outline-none w-28"
                    style={{borderColor:C.primary, color:C.ink}}/>
                  <button onClick={saveNickname}
                    className="p-0.5 rounded-md" style={{background:C.primary, color:'#fff'}}>
                    <Check size={13}/>
                  </button>
                  <button onClick={()=>setIsEditingNickname(false)}
                    className="p-0.5 rounded-md" style={{background:'#F4F7FA', color:C.muted}}>
                    <X size={13}/>
                  </button>
                </div>
              ) : (
                <p className="text-sm font-black truncate" style={{color:C.ink}}>{displayNickname}</p>
              )}
            </div>
          </div>
          {!isEditingNickname && (
            <button onClick={()=>{setNicknameInput(displayNickname);setIsEditingNickname(true);}}
              className="p-1.5 rounded-xl shrink-0" style={{color:C.muted}}>
              <Edit2 size={15}/>
            </button>
          )}
        </div>

        {/* ── 自己的行程 ── */}
        <div className="space-y-3 mb-4">
          {trips.length===0 && !creating && (
            <div className="rounded-2xl p-10 text-center"
              style={{background:C.card, border:`1px solid ${C.border}`}}>
              <div className="text-4xl mb-3">✈️</div>
              <p className="text-sm" style={{color:C.muted}}>還沒有任何旅程，<br/>點下方按鈕來建立第一趟吧！</p>
            </div>
          )}
          {trips.map(trip => {
            const Icon = TRIP_ICONS[trip.iconIndex % TRIP_ICONS.length] || Plane;
            return (
              <div key={trip.id} onClick={()=>onSelect(trip.id)}
                className="rounded-2xl p-4 flex items-center gap-4 cursor-pointer transition-all active:scale-[0.99] group"
                style={{background:C.card, border:`1px solid ${C.border}`, boxShadow:C.cardShadow}}>
                <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                  style={{background:C.primaryLight}}>
                  <Icon size={20} style={{color:C.primary}} strokeWidth={2.5}/>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black truncate" style={{color:C.ink}}>{trip.name}</p>
                  <p className="text-[11px] mt-0.5 flex items-center gap-1" style={{color:C.muted}}>
                    {trip.tripStartDate && trip.tripEndDate && (
                      <><Calendar size={10}/>{fmtShort(trip.tripStartDate)} – {fmtShort(trip.tripEndDate)} · </>
                    )}
                    {trip.itinerary?.length ?? 0} 行程・{trip.expenses?.length ?? 0} 筆花費
                  </p>
                </div>
                <button onClick={e=>{e.stopPropagation();setDeletingTrip(trip);setDeleteInput('');}}
                  className="p-2 rounded-xl opacity-0 group-hover:opacity-100 transition-all"
                  style={{color:C.danger}}>
                  <Trash2 size={16}/>
                </button>
              </div>
            );
          })}
        </div>

        {/* ── 分享給我的行程 ── */}
        {sharedTrips?.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-1.5 mb-3">
              <Users size={13} style={{color:C.muted}}/>
              <span className="text-[11px] font-black uppercase tracking-widest" style={{color:C.muted}}>分享給我的行程</span>
            </div>
            <div className="space-y-3">
              {sharedTrips.map(trip => (
                <div key={trip.id} onClick={()=>onSelect(trip.id)}
                  className="rounded-2xl p-4 flex items-center gap-4 cursor-pointer transition-all active:scale-[0.99]"
                  style={{background:C.card, border:`1px solid ${C.border}`, boxShadow:C.cardShadow}}>
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-xl"
                    style={{background:C.primaryLight}}>
                    {ICON_EMOJIS[trip.iconIndex ?? 0] ?? '🤝'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black truncate" style={{color:C.ink}}>{trip.name || '載入中...'}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[11px]" style={{color:C.muted}}>
                        {trip.itinerary?.length ?? 0} 行程・{trip.expenses?.length ?? 0} 筆花費
                      </span>
                      <RoleBadge role={trip.sharedRole}/>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 新增旅程 ── */}
        {creating ? (
          <div className="rounded-2xl p-4 space-y-3"
            style={{background:C.card, border:`1.5px solid ${C.primary}`, boxShadow:C.cardShadow}}>

            {/* mode 切換 */}
            <div className="flex gap-1 p-1 rounded-xl" style={{background:'#F4F7FA'}}>
              {[['manual','手動建立'],['markdown','從 Markdown 匯入']].map(([m,l])=>(
                <button key={m} onClick={()=>{setCreateMode(m);setMdPreview(null);}}
                  className="flex-1 py-2 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5"
                  style={createMode===m?{background:C.primary,color:'#fff'}:{color:C.muted}}>
                  {m==='markdown'&&<FileText size={12}/>}{l}
                </button>
              ))}
            </div>

            {/* ── 手動建立 ── */}
            {createMode==='manual' && <>
              <input autoFocus type="text"
                placeholder="旅程名稱（如：東京五天四夜）"
                value={newName} onChange={e=>setNewName(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&handleCreate()}
                className="w-full border rounded-2xl px-4 py-3 text-sm font-bold outline-none"
                style={{borderColor:C.border, color:C.ink}}/>
              <div className="rounded-2xl p-3 space-y-2" style={{background:C.primaryLight}}>
                <div className="flex items-center gap-1.5">
                  <Calendar size={12} style={{color:C.primary}}/>
                  <span className="text-[11px] font-black" style={{color:C.primary}}>旅行日期（可跳過）</span>
                </div>
                <div className="flex gap-2 items-center">
                  <input type="date" value={startDate}
                    onChange={e=>{setStartDate(e.target.value);if(endDate&&e.target.value>endDate)setEndDate('');}}
                    className="flex-1 border rounded-xl px-2 py-2 text-xs outline-none"
                    style={{borderColor:`${C.primary}44`, color:C.ink, background:C.card}}/>
                  <span style={{color:C.muted, fontSize:12}}>→</span>
                  <input type="date" value={endDate} min={startDate}
                    onChange={e=>setEndDate(e.target.value)}
                    className="flex-1 border rounded-xl px-2 py-2 text-xs outline-none"
                    style={{borderColor:`${C.primary}44`, color:C.ink, background:C.card}}/>
                </div>
                {days && <p className="text-center text-xs font-black" style={{color:C.primary}}>共 {days} 天（{fmtShort(startDate)} – {fmtShort(endDate)}）</p>}
              </div>
              <div className="flex gap-2">
                <button onClick={()=>{setCreating(false);setStartDate('');setEndDate('');setCreateMode('manual');}}
                  className="flex-1 py-3 rounded-2xl text-sm font-bold" style={{background:'#F4F7FA', color:C.muted}}>取消</button>
                <button onClick={handleCreate}
                  className="flex-1 py-3 rounded-2xl text-sm font-black text-white" style={{background:C.primary}}>建立旅程</button>
              </div>
            </>}

            {/* ── Markdown 匯入 ── */}
            {createMode==='markdown' && <>
              {!mdPreview ? (
                <>
                  <textarea
                    autoFocus
                    value={mdImportText} onChange={e=>setMdImportText(e.target.value)}
                    placeholder={"貼上 Markdown 行程內容...\n\n# 旅程名稱\n- 日期：2026-05-01 ~ 2026-05-09\n- 幣別：TWD\n\n## 行程\n..."}
                    className="w-full border rounded-2xl px-4 py-3 text-sm resize-none outline-none"
                    rows={10} style={{borderColor:C.border, color:C.ink}}/>
                  <div className="flex gap-2">
                    <button onClick={()=>{setCreating(false);setMdImportText('');setCreateMode('manual');}}
                      className="flex-1 py-3 rounded-2xl text-sm font-bold" style={{background:'#F4F7FA', color:C.muted}}>取消</button>
                    <button onClick={handleMdPreview} disabled={!mdImportText.trim()}
                      className="flex-1 py-3 rounded-2xl text-sm font-black text-white"
                      style={{background:mdImportText.trim()?C.primary:C.muted}}>解析預覽</button>
                  </div>
                </>
              ) : (
                <>
                  {/* 預覽結果 */}
                  <div className="rounded-2xl p-3 space-y-1.5" style={{background:C.primaryLight}}>
                    <p className="text-xs font-black" style={{color:C.primary}}>解析結果預覽</p>
                    <p className="text-sm font-black" style={{color:C.ink}}>📌 {mdPreview.tripName||'（未偵測到名稱）'}</p>
                    {mdPreview.tripStartDate && <p className="text-xs" style={{color:C.body}}>📅 {mdPreview.tripStartDate} ~ {mdPreview.tripEndDate}</p>}
                    {mdPreview.baseCurrency  && <p className="text-xs" style={{color:C.body}}>💰 幣別：{mdPreview.baseCurrency}</p>}
                    <div className="flex gap-3 mt-1">
                      {[
                        ['🗓', mdPreview.itineraryItems.length, '行程'],
                        ['🏨', mdPreview.accommodationItems.length, '住宿'],
                        ['✅', mdPreview.checklistItems.length, '清單'],
                        ['⭐', mdPreview.savedSpotItems.length, '收藏'],
                      ].map(([icon, count, label]) => count > 0 && (
                        <span key={label} className="text-xs font-bold" style={{color:C.primary}}>
                          {icon} {count} {label}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={()=>setMdPreview(null)}
                      className="flex-1 py-3 rounded-2xl text-sm font-bold" style={{background:'#F4F7FA', color:C.muted}}>重新編輯</button>
                    <button onClick={handleCreateFromMarkdown}
                      className="flex-1 py-3 rounded-2xl text-sm font-black text-white" style={{background:C.primary}}>建立行程</button>
                  </div>
                </>
              )}
            </>}
          </div>
        ) : (
          <button onClick={()=>setCreating(true)}
            className="w-full py-4 rounded-2xl flex justify-center items-center gap-2 font-black text-sm border-2 border-dashed transition-all active:scale-[0.99]"
            style={{borderColor:`${C.primary}55`, color:C.primary}}>
            <Plus size={18}/> 新增旅程
          </button>
        )}
      </div>

      {/* ── 刪除確認彈窗 ── */}
      {deletingTrip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{background:'rgba(0,0,0,0.4)'}}>
          <div className="w-full rounded-3xl p-6 shadow-2xl" style={{background:C.card, maxWidth:'360px'}}>
            <h3 className="text-lg font-black mb-1" style={{color:C.ink}}>刪除行程</h3>
            <p className="text-sm mb-4 leading-relaxed" style={{color:C.muted}}>
              此操作<span className="font-black" style={{color:C.danger}}>無法復原</span>。<br/>
              請輸入行程名稱「<span className="font-black" style={{color:C.ink}}>{deletingTrip.name}</span>」以確認刪除。
            </p>
            <input autoFocus type="text"
              placeholder="輸入行程名稱..."
              value={deleteInput} onChange={e=>setDeleteInput(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&handleDeleteConfirm()}
              className="w-full border rounded-2xl px-4 py-3 text-sm outline-none mb-3"
              style={{borderColor:C.border, color:C.ink}}/>
            <div className="flex gap-2">
              <button onClick={()=>{setDeletingTrip(null);setDeleteInput('');}}
                className="flex-1 py-3 rounded-2xl text-sm font-bold"
                style={{background:'#F4F7FA', color:C.muted}}>
                取消
              </button>
              <button onClick={handleDeleteConfirm}
                disabled={deleteInput!==deletingTrip.name}
                className="flex-1 py-3 rounded-2xl text-sm font-black text-white transition-all"
                style={{background:deleteInput===deletingTrip.name ? C.danger : C.muted}}>
                確認刪除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
