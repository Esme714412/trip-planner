import { useState, useEffect } from 'react';
import { onAuthStateChanged, getRedirectResult } from 'firebase/auth';
import { collection, onSnapshot, orderBy, query, doc, getDoc, where } from 'firebase/firestore';
import { auth, db } from './firebase/config';
import AuthScreen   from './components/AuthScreen';
import TripSelector from './components/TripSelector';
import TripApp      from './components/TripApp';

export default function App() {
  const [user,         setUser]         = useState(undefined);
  const [trips,        setTrips]        = useState([]);
  const [sharedTrips,  setSharedTrips]  = useState([]);
  const [activeTripId, setActiveTripId] = useState(null);
  const [activeTripOwner, setActiveTripOwner] = useState(null); // 行程擁有者 uid
  const [redirectDone, setRedirectDone] = useState(false);

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
    const unsub = onAuthStateChanged(auth, u => setUser(u ?? null));
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

  // ── 被分享的行程 ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) { setSharedTrips([]); return; }

    // 查詢 editors 或 viewers 包含目前使用者 uid 的 sharedTrips
    const editorsQ  = query(collection(db, 'sharedTrips'), where('editors', 'array-contains', user.uid));
    const viewersQ  = query(collection(db, 'sharedTrips'), where('viewers', 'array-contains', user.uid));

    const results = {};

    const unsubE = onSnapshot(editorsQ, snap => {
      snap.docs.forEach(d => { results[d.id] = { ...d.data(), sharedRole: 'editor' }; });
      setSharedTrips(Object.values(results));
    });

    const unsubV = onSnapshot(viewersQ, snap => {
      snap.docs.forEach(d => { results[d.id] = { ...d.data(), sharedRole: 'viewer' }; });
      setSharedTrips(Object.values(results));
    });

    return () => { unsubE(); unsubV(); };
  }, [user]);

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
    const myTrip     = trips.find(t => t.id === activeTripId);
    const sharedTrip = sharedTrips.find(t => t.tripId === activeTripId);

    if (!myTrip && !sharedTrip) { setActiveTripId(null); return null; }

    const ownerUid = myTrip ? user.uid : sharedTrip.ownerUid;
    const tripData = myTrip || sharedTrip;
    const isReadOnly = sharedTrip?.sharedRole === 'viewer';

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

  return (
    <TripSelector
      uid={user.uid}
      trips={trips}
      sharedTrips={sharedTrips}
      onSelect={id => setActiveTripId(id)}
    />
  );
}