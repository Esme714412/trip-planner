import { useState } from 'react';
import { collection, addDoc, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { db, auth } from '../firebase/config';
import { Plus, Trash2, LogOut, Users, Edit2, Check, X, Calendar } from 'lucide-react';

const ICONS = ['✈️', '🗺️', '🎒', '📸', '🏖️', '🏔️', '🌏', '🍜'];

const DEFAULT_TRIP = {
  iconIndex: 0,
  categories: ['飲食', '交通', '住宿', '購物', '娛樂', '門票', '其他'],
  rates: { TWD: 1, JPY: 0.21, USD: 31.5 },
  baseCurrency: 'TWD',
  checklist: [],
  itinerary: [],
  expenses: [],
};

// 格式化日期顯示
function fmtShort(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getMonth()+1}/${d.getDate()}`;
}

export default function TripSelector({ uid, userProfile, trips, sharedTrips, onSelect }) {
  const [creating,       setCreating]       = useState(false);
  const [newName,        setNewName]        = useState('');
  const [startDate,      setStartDate]      = useState('');
  const [endDate,        setEndDate]        = useState('');

  // 暱稱編輯
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [nicknameInput,     setNicknameInput]     = useState('');

  // 刪除保護
  const [deletingTrip,   setDeletingTrip]   = useState(null); // { id, name }
  const [deleteInput,    setDeleteInput]    = useState('');

  const displayNickname = userProfile?.nickname
    || userProfile?.displayName
    || userProfile?.email?.split('@')[0]
    || '我';

  const startEditNickname = () => {
    setNicknameInput(displayNickname);
    setIsEditingNickname(true);
  };

  const saveNickname = async () => {
    const name = nicknameInput.trim();
    if (!name) return;
    await updateDoc(doc(db, 'userProfiles', uid), { nickname: name });
    setIsEditingNickname(false);
  };

  // 計算天數
  const tripDays = (s, e) => {
    if (!s || !e) return null;
    const diff = (new Date(e) - new Date(s)) / (1000 * 60 * 60 * 24);
    return diff >= 0 ? Math.round(diff) + 1 : null;
  };

  const handleCreate = async () => {
    const name  = newName.trim() || '新旅程';
    const myName = userProfile?.nickname || userProfile?.displayName || userProfile?.email?.split('@')[0] || '自己';
    const days = tripDays(startDate, endDate);
    const ref = await addDoc(collection(db, 'users', uid, 'trips'), {
      ...DEFAULT_TRIP,
      name,
      users: [myName],
      tripStartDate: startDate || '',
      tripEndDate:   endDate   || '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    setCreating(false);
    setNewName('');
    setStartDate('');
    setEndDate('');
    onSelect(ref.id);
  };

  // 刪除：打開確認彈窗
  const handleDeleteClick = (e, trip) => {
    e.stopPropagation();
    setDeletingTrip(trip);
    setDeleteInput('');
  };

  // 刪除：確認輸入後執行
  const handleDeleteConfirm = async () => {
    if (deleteInput !== deletingTrip.name) return;
    await deleteDoc(doc(db, 'users', uid, 'trips', deletingTrip.id));
    setDeletingTrip(null);
    setDeleteInput('');
  };

  const handleSignOut = () => signOut(auth);

  const days = tripDays(startDate, endDate);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-100 p-6">
      <div className="max-w-sm mx-auto pt-10">

        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">我的旅程</h1>
            <p className="text-slate-500 text-sm mt-0.5">選擇或建立一趟旅行</p>
          </div>
          <button onClick={handleSignOut} className="flex items-center gap-1.5 text-xs text-slate-500 bg-white px-3 py-2 rounded-xl border border-slate-200 hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors shadow-sm">
            <LogOut size={14} /> 登出
          </button>
        </div>

        {/* 暱稱卡片 */}
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold text-base shrink-0">
                {displayNickname[0]?.toUpperCase() || '我'}
              </div>
              <div>
                <div className="text-xs text-slate-400 mb-0.5">我的暱稱（顯示於行程參與人員）</div>
                {isEditingNickname ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      autoFocus
                      type="text"
                      value={nicknameInput}
                      onChange={e => setNicknameInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && saveNickname()}
                      className="border-b border-indigo-400 bg-transparent outline-none text-sm font-bold text-slate-700 w-32 px-1"
                    />
                    <button onClick={saveNickname}                    className="text-green-500 hover:text-green-700"><Check size={16}/></button>
                    <button onClick={() => setIsEditingNickname(false)} className="text-slate-400 hover:text-slate-600"><X size={16}/></button>
                  </div>
                ) : (
                  <div className="font-bold text-slate-700 text-sm">{displayNickname}</div>
                )}
              </div>
            </div>
            {!isEditingNickname && (
              <button onClick={startEditNickname} className="p-1.5 text-slate-300 hover:text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors">
                <Edit2 size={15}/>
              </button>
            )}
          </div>
        </div>

        {/* 自己的行程 */}
        <div className="space-y-3 mb-5">
          {trips.length === 0 && !creating && (
            <div className="bg-white rounded-2xl p-8 text-center border border-slate-100 shadow-sm">
              <div className="text-4xl mb-3">✈️</div>
              <p className="text-slate-500 text-sm">還沒有任何旅程，<br/>點下方按鈕來建立第一趟吧！</p>
            </div>
          )}
          {trips.map(trip => (
            <div
              key={trip.id}
              onClick={() => onSelect(trip.id)}
              className="bg-white rounded-2xl p-4 flex items-center gap-4 cursor-pointer border border-slate-100 shadow-sm hover:border-indigo-300 hover:shadow-md transition-all group"
            >
              <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center text-2xl shrink-0">
                {ICONS[trip.iconIndex ?? 0] ?? '✈️'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-slate-800 truncate group-hover:text-indigo-700">{trip.name}</div>
                <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1 flex-wrap">
                  {trip.tripStartDate && trip.tripEndDate
                    ? <><Calendar size={10}/>{fmtShort(trip.tripStartDate)} – {fmtShort(trip.tripEndDate)} · </>
                    : null
                  }
                  {trip.itinerary?.length ?? 0} 個行程・{trip.expenses?.length ?? 0} 筆花費
                </div>
              </div>
              <button
                onClick={e => handleDeleteClick(e, trip)}
                className="p-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>

        {/* 被分享的行程 */}
        {sharedTrips?.length > 0 && (
          <div className="mt-2 mb-5">
            <h2 className="text-sm font-bold text-slate-500 mb-3 flex items-center gap-1">
              <Users size={14}/> 分享給我的行程
            </h2>
            <div className="space-y-3">
              {sharedTrips.map(trip => (
                <div
                  key={trip.id}
                  onClick={() => onSelect(trip.id)}
                  className="bg-white rounded-2xl p-4 flex items-center gap-4 cursor-pointer border border-slate-100 shadow-sm hover:border-purple-300 hover:shadow-md transition-all group"
                >
                  <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center text-2xl shrink-0">
                    {ICONS[trip.iconIndex ?? 0] ?? '🤝'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-800 truncate group-hover:text-purple-700">
                      {trip.name || '載入中...'}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {trip.itinerary?.length ?? 0} 個行程・{trip.expenses?.length ?? 0} 筆花費・
                      {trip.sharedRole === 'editor' ? '✏️ 可編輯' : '👁 只能查看'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 新增行程表單 */}
        {creating ? (
          <div className="bg-white rounded-2xl p-4 border-2 border-indigo-300 shadow-sm space-y-3">
            <input
              autoFocus
              type="text"
              placeholder="旅程名稱（如：東京五天四夜）"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
            />

            {/* 日期區間 */}
            <div className="bg-indigo-50 rounded-xl p-3 space-y-2">
              <div className="text-xs font-bold text-indigo-700 flex items-center gap-1 mb-1">
                <Calendar size={13}/> 旅行日期（可跳過）
              </div>
              <div className="flex gap-2 items-center">
                <input
                  type="date"
                  value={startDate}
                  onChange={e => {
                    setStartDate(e.target.value);
                    if (endDate && e.target.value > endDate) setEndDate('');
                  }}
                  className="flex-1 border border-indigo-200 rounded-lg px-2 py-2 text-xs bg-white outline-none focus:ring-2 focus:ring-indigo-400"
                />
                <span className="text-slate-400 text-xs shrink-0">→</span>
                <input
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="flex-1 border border-indigo-200 rounded-lg px-2 py-2 text-xs bg-white outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>
              {days && (
                <div className="text-center text-xs font-bold text-indigo-600">
                  共 {days} 天 ({fmtShort(startDate)} – {fmtShort(endDate)})
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button onClick={() => { setCreating(false); setStartDate(''); setEndDate(''); }} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-slate-500 text-sm font-medium hover:bg-slate-50">取消</button>
              <button onClick={handleCreate} className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 shadow-sm">建立旅程</button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="w-full py-4 border-2 border-dashed border-indigo-300 text-indigo-600 font-bold rounded-2xl flex justify-center items-center gap-2 hover:bg-indigo-50 transition-colors"
          >
            <Plus size={20} /> 新增旅程
          </button>
        )}
      </div>

      {/* 刪除確認彈窗 */}
      {deletingTrip && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="font-bold text-lg text-slate-800 mb-1">刪除行程</h3>
            <p className="text-sm text-slate-500 mb-4">
              此操作<span className="font-bold text-red-500">無法復原</span>。<br/>
              請輸入行程名稱「<span className="font-bold text-slate-700">{deletingTrip.name}</span>」以確認刪除。
            </p>
            <input
              autoFocus
              type="text"
              placeholder="輸入行程名稱..."
              value={deleteInput}
              onChange={e => setDeleteInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleDeleteConfirm()}
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-red-400 mb-3"
            />
            <div className="flex gap-2">
              <button onClick={() => { setDeletingTrip(null); setDeleteInput(''); }} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-slate-500 text-sm font-medium hover:bg-slate-50">取消</button>
              <button
                onClick={handleDeleteConfirm}
                disabled={deleteInput !== deletingTrip.name}
                className="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-sm font-bold hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
              >確認刪除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
