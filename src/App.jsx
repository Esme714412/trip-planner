import { useState, useEffect } from 'react';
import { onAuthStateChanged, getRedirectResult } from 'firebase/auth';
import { collection, onSnapshot, orderBy, query, where, setDoc, doc } from 'firebase/firestore';
import { auth, db } from './firebase/config';
import AuthScreen   from './components/AuthScreen';
import TripSelector from './components/TripSelector';
import TripApp      from './components/TripApp';

export default function App() {
  const [user,              setUser]              = useState(undefined);
  const [trips,             setTrips]             = useState([]);
  const [sharedTrips,       setSharedTrips]       = useState([]);
  const [sharedTripDataMap, setSharedTripDataMap] = useState({});
  const [activeTripId,      setActiveTripId]      = useState(null);
  const [redirectDone,      setRedirectDone]      = useState(false);

  useEffect(() => {
    getRedirectResult(auth)
      .then(result => { if (result?.user) console.log('Redirect 登入成功'); })
      .catch(err => console.error(err))
      .finally(() => setRedirectDone(true));
  }, []);

  useEffect(() => {
    if (!redirectDone) return;
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u ?? null);
      if (u) {
        console.log('🔑 登入 uid:', u.uid, 'email:', u.email);
        await setDoc(doc(db, 'userProfiles', u.uid), {
          uid: u.uid,
          email: u.email,
          displayName: u.displayName || '',
        }, { merge: true });
      }
    });
    return unsub;
  }, [redirectDone]);

  useEffect(() => {
    if (!user) { setTrips([]); return; }
    const q = query(collection(db, 'users', user.uid, 'trips'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setTrips(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [user]);

  // ── 被分享的行程 metadata ─────────────────────────────────────────────────
  useEffect(() => {
    if (!user) { setSharedTrips([]); setSharedTripDataMap({}); return; }

    console.log('🔍 開始查詢 sharedTrips，uid:', user.uid);

    const results = {};

    const unsubE = onSnapshot(
      query(collection(db, 'sharedTrips'), where('editors', 'array-contains', user.uid)),
      snap => {
        console.log('✏️ editors 查詢結果數量:', snap.docs.length);
        snap.docs.forEach(d => {
          console.log('  editor trip:', d.id, d.data());
          results[d.id] = { ...d.data(), sharedRole: 'editor' };
        });
        setSharedTrips(Object.values(results));
      },
      err => console.error('❌ editors 查詢失敗:', err)
    );

    const unsubV = onSnapshot(
      query(collection(db, 'sharedTrips'), where('viewers', 'array-contains', user.uid)),
      snap => {
        console.log('👁 viewers 查詢結果數量:', snap.docs.length);
        snap.docs.forEach(d => {
          console.log('  viewer trip:', d.id, d.data());
          results[d.id] = { ...d.data(), sharedRole: 'viewer' };
        });
        setSharedTrips(Object.values(results));
      },
      err => console.error('❌ viewers 查詢失敗:', err)
    );

    return () => { unsubE(); unsubV(); };
  }, [user]);

  // ── 被分享的行程：補齊完整資料 ────────────────────────────────────────────
  useEffect(() => {
    console.log('📦 sharedTrips 更新:', sharedTrips.length, '筆', sharedTrips);

    if (sharedTrips.length === 0) { setSharedTripDataMap({}); return; }

    const unsubs = [];
    const dataMap = {};

    sharedTrips.forEach(meta => {
      console.log('📖 訂閱行程資料:', `users/${meta.ownerUid}/trips/${meta.tripId}`);
      const tripRef = doc(db, 'users', meta.ownerUid, 'trips', meta.tripId);
      const unsub = onSnapshot(
        tripRef,
        snap => {
          if (snap.exists()) {
            console.log('✅ 行程資料載入成功:', snap.id, snap.data().name);
            dataMap[meta.tripId] = {
              ...snap.data(),
              id: snap.id,
              ownerUid: meta.ownerUid,
              sharedRole: meta.sharedRole,
              editors: meta.editors || [],
              viewers: meta.viewers || [],
            };
          } else {
            console.warn('⚠️ 行程不存在:', meta.tripId);
            delete dataMap[meta.tripId];
          }
          setSharedTripDataMap({ ...dataMap });
        },
        err => console.error('❌ 行程資料讀取失敗:', err.code, err.message)
      );
      unsubs.push(unsub);
    });

    return () => unsubs.forEach(u => u());
  }, [sharedTrips]);

  if (!redirectDone || user === undefined) {
    return (
      <div className="min-h-screen bg-indigo-50 flex items-center justify-center">
        <div className="text-indigo-400 text-4xl animate-pulse">✈️</div>
      </div>
    );
  }

  if (!user) return <AuthScreen />;

  if (activeTripId) {
    const myTrip         = trips.find(t => t.id === activeTripId);
    const sharedMeta     = sharedTrips.find(t => t.tripId === activeTripId);
    const sharedTripData = sharedTripDataMap[activeTripId];

    const tripData = myTrip || sharedTripData;

    if (!tripData) {
      return (
        <div className="min-h-screen bg-indigo-50 flex items-center justify-center">
          <div className="text-indigo-400 text-4xl animate-pulse">✈️</div>
        </div>
      );
    }

    const ownerUid   = myTrip ? user.uid : sharedMeta?.ownerUid;
    const isReadOnly = sharedMeta?.sharedRole === 'viewer';

    return (
      <TripApp
        uid={ownerUid}
        tripId={activeTripId}
        initialData={tripData}
        readOnly={isReadOnly}
        onBack={() => setActiveTripId(null)}
      />
    );
  }

  const sharedTripsWithData = Object.values(sharedTripDataMap);
  console.log('🗂 傳給 TripSelector 的 sharedTrips:', sharedTripsWithData.length, '筆');

  return (
    <TripSelector
      uid={user.uid}
      trips={trips}
      sharedTrips={sharedTripsWithData}
      onSelect={id => setActiveTripId(id)}
    />
  );
}
