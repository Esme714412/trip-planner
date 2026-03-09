import { useState, useEffect } from 'react';
import { onAuthStateChanged, getRedirectResult } from 'firebase/auth';
import { collection, onSnapshot, orderBy, query, where, setDoc, doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase/config';
import AuthScreen   from './components/AuthScreen';
import TripSelector from './components/TripSelector';
import TripApp      from './components/TripApp';

export default function App() {
  const [user,              setUser]              = useState(undefined);
  const [trips,             setTrips]             = useState([]);
  const [sharedTrips,       setSharedTrips]       = useState([]);  // 只存 metadata（ownerUid, tripId, role）
  const [sharedTripDataMap, setSharedTripDataMap] = useState({});  // tripId → 完整行程資料
  const [activeTripId,      setActiveTripId]      = useState(null);
  const [redirectDone,      setRedirectDone]      = useState(false);

  // ── Redirect 處理 ─────────────────────────────────────────────────────────
  useEffect(() => {
    getRedirectResult(auth)
      .then(result => { if (result?.user) console.log('Redirect 登入成功'); })
      .catch(err => console.error(err))
      .finally(() => setRedirectDone(true));
  }, []);

  // ── Auth listener ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!redirectDone) return;
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u ?? null);
      if (u) {
        await setDoc(doc(db, 'userProfiles', u.uid), {
          uid: u.uid,
          email: u.email,
          displayName: u.displayName || '',
        }, { merge: true });
      }
    });
    return unsub;
  }, [redirectDone]);

  // ── 自己的行程 ────────────────────────────────────────────────────────────
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

    const results = {};

    const unsubE = onSnapshot(
      query(collection(db, 'sharedTrips'), where('editors', 'array-contains', user.uid)),
      snap => {
        snap.docs.forEach(d => { results[d.id] = { ...d.data(), sharedRole: 'editor' }; });
        setSharedTrips(Object.values(results));
      }
    );

    const unsubV = onSnapshot(
      query(collection(db, 'sharedTrips'), where('viewers', 'array-contains', user.uid)),
      snap => {
        snap.docs.forEach(d => { results[d.id] = { ...d.data(), sharedRole: 'viewer' }; });
        setSharedTrips(Object.values(results));
      }
    );

    return () => { unsubE(); unsubV(); };
  }, [user]);

  // ── 被分享的行程：補齊完整資料（名稱、內容）────────────────────────────────
  // sharedTrips 只有 metadata，要再去 users/{ownerUid}/trips/{tripId} 拿真正的資料
  useEffect(() => {
    if (sharedTrips.length === 0) { setSharedTripDataMap({}); return; }

    const unsubs = [];
    const dataMap = {};

    sharedTrips.forEach(meta => {
      const tripRef = doc(db, 'users', meta.ownerUid, 'trips', meta.tripId);
      const unsub = onSnapshot(tripRef, snap => {
        if (snap.exists()) {
          dataMap[meta.tripId] = {
            ...snap.data(),
            id: snap.id,
            ownerUid: meta.ownerUid,
            sharedRole: meta.sharedRole,
            editors: meta.editors || [],
            viewers: meta.viewers || [],
          };
        } else {
          delete dataMap[meta.tripId];
        }
        setSharedTripDataMap({ ...dataMap });
      });
      unsubs.push(unsub);
    });

    return () => unsubs.forEach(u => u());
  }, [sharedTrips]);

  // ── Loading ───────────────────────────────────────────────────────────────
  if (!redirectDone || user === undefined) {
    return (
      <div className="min-h-screen bg-indigo-50 flex items-center justify-center">
        <div className="text-indigo-400 text-4xl animate-pulse">✈️</div>
      </div>
    );
  }

  if (!user) return <AuthScreen />;

  // ── 進入行程 ──────────────────────────────────────────────────────────────
  if (activeTripId) {
    const myTrip         = trips.find(t => t.id === activeTripId);
    const sharedMeta     = sharedTrips.find(t => t.tripId === activeTripId);
    const sharedTripData = sharedTripDataMap[activeTripId];

    // 自己的行程直接用，共享行程等完整資料載入
    const tripData = myTrip || sharedTripData;

    // 資料還沒到，顯示 loading
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

  // ── 行程列表：把完整資料傳給 TripSelector ─────────────────────────────────
  const sharedTripsWithData = Object.values(sharedTripDataMap);

  return (
    <TripSelector
      uid={user.uid}
      trips={trips}
      sharedTrips={sharedTripsWithData}
      onSelect={id => setActiveTripId(id)}
    />
  );
}
