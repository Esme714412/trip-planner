import { useState } from 'react';
import { collection, addDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { db, auth } from '../firebase/config';
import { Plus, Trash2, LogOut, Plane, MapPin, Camera, Luggage, Users } from 'lucide-react';

const ICONS = ['✈️', '🗺️', '🎒', '📸', '🏖️', '🏔️', '🌏', '🍜'];

const DEFAULT_TRIP = {
  name: '新旅程',
  iconIndex: 0,
  users: ['自己'],
  categories: ['飲食', '交通', '住宿', '購物', '娛樂', '門票', '其他'],
  rates: { TWD: 1, JPY: 0.21, USD: 31.5 },
  baseCurrency: 'TWD',
  checklist: [],
  itinerary: [],
  expenses: [],
};

export default function TripSelector({ uid, trips, sharedTrips, onSelect }) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const handleCreate = async () => {
    const name = newName.trim() || '新旅程';
    const ref = await addDoc(collection(db, 'users', uid, 'trips'), {
      ...DEFAULT_TRIP,
      name,
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
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">我的旅程</h1>
            <p className="text-slate-500 text-sm mt-0.5">選擇或建立一趟旅行</p>
          </div>
          <button onClick={handleSignOut} className="flex items-center gap-1.5 text-xs text-slate-500 bg-white px-3 py-2 rounded-xl border border-slate-200 hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors shadow-sm">
            <LogOut size={14} /> 登出
          </button>
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

        {/* Create New */}
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
