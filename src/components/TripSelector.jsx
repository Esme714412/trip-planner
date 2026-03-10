import { useState } from 'react';
import { collection, addDoc, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { db, auth } from '../firebase/config';
import { Plus, Trash2, LogOut, Users, Edit2, Check, X } from 'lucide-react';

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

export default function TripSelector({ uid, userProfile, trips, sharedTrips, onSelect }) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  // ── 暱稱編輯 ─────────────────────────────────────────────────────────────
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [nicknameInput,     setNicknameInput]     = useState('');

  // 優先顯示：自訂 nickname > Google displayName > email 前綴
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

  // ── 建立行程 ─────────────────────────────────────────────────────────────
  const handleCreate = async () => {
    const name = newName.trim() || '新旅程';
    // 用自己的暱稱當第一個參與人員
    const myName = userProfile?.nickname
      || userProfile?.displayName
      || userProfile?.email?.split('@')[0]
      || '自己';
    const ref = await addDoc(collection(db, 'users', uid, 'trips'), {
      ...DEFAULT_TRIP,
      name,
      users: [myName],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    setCreating(false);
    setNewName('');
    onSelect(ref.id);
  };

  const handleDelete = async (e, tripId) => {
    e.stopPropagation();
    if (!window.confirm('確定刪除這趟旅程？此操作無法復原。')) return;
    await deleteDoc(doc(db, 'users', uid, 'trips', tripId));
  };

  const handleSignOut = () => signOut(auth);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-100 p-6">
      <div className="max-w-sm mx-auto pt-10">

        {/* ── Header ── */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">我的旅程</h1>
            <p className="text-slate-500 text-sm mt-0.5">選擇或建立一趟旅行</p>
          </div>
          <button onClick={handleSignOut} className="flex items-center gap-1.5 text-xs text-slate-500 bg-white px-3 py-2 rounded-xl border border-slate-200 hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors shadow-sm">
            <LogOut size={14} /> 登出
          </button>
        </div>

        {/* ── 我的暱稱 ── */}
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold text-sm">
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
                    <button onClick={saveNickname} className="text-green-500 hover:text-green-700"><Check size={16}/></button>
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

        {/* ── 自己的行程 ── */}
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
                <div className="text-xs text-slate-400 mt-0.5">
                  {trip.itinerary?.length ?? 0} 個行程・{trip.expenses?.length ?? 0} 筆花費
                </div>
              </div>
              <button
                onClick={e => handleDelete(e, trip.id)}
                className="p-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>

        {/* ── 被分享的行程 ── */}
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

        {/* ── 新增行程 ── */}
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
            <div className="flex gap-2">
              <button onClick={() => setCreating(false)} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-slate-500 text-sm font-medium hover:bg-slate-50">取消</button>
              <button onClick={handleCreate}              className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 shadow-sm">建立旅程</button>
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
    </div>
  );
}
