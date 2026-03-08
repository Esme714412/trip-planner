import { useState, useEffect } from 'react';
import { onAuthStateChanged, getRedirectResult } from 'firebase/auth'; // 加入 getRedirectResult
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { auth, db } from './firebase/config';
import AuthScreen    from './components/AuthScreen';
import TripSelector  from './components/TripSelector';
import TripApp       from './components/TripApp';

export default function App() {
  const [user,          setUser]          = useState(undefined);
  const [trips,         setTrips]         = useState([]);
  const [activeTripId,  setActiveTripId]  = useState(null);

  // ── 處理手機 Redirect 登入結果 ────────────────────────────────────────────
  useEffect(() => {
    getRedirectResult(auth).catch((err) => {
      console.error('Redirect 登入失敗：', err);
    });
  }, []);

  // ── Auth listener ─────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => setUser(u ?? null));
    return unsub;
  }, []);

  // ── Trips listener (only when logged in) ──────────────────────────────────
  useEffect(() => {
    if (!user) { setTrips([]); return; }
    const q = query(collection(db, 'users', user.uid, 'trips'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setTrips(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [user]);

  // ── Loading screen ────────────────────────────────────────────────────────
  if (user === undefined) {
    return (
      <div className="min-h-screen bg-indigo-50 flex items-center justify-center">
        <div className="text-indigo-400 text-4xl animate-pulse">✈️</div>
      </div>
    );
  }

  // ── Not logged in ─────────────────────────────────────────────────────────
  if (!user) return <AuthScreen />;

  // ── Active trip ───────────────────────────────────────────────────────────
  if (activeTripId) {
    const tripData = trips.find(t => t.id === activeTripId);
    if (!tripData) {
      // Trip was deleted elsewhere — return to selector
      setActiveTripId(null);
      return null;
    }
    return (
      <TripApp
        uid={user.uid}
        tripId={activeTripId}
        initialData={tripData}
        onBack={() => setActiveTripId(null)}
      />
    );
  }

  // ── Trip selector ─────────────────────────────────────────────────────────
  return (
    <TripSelector
      uid={user.uid}
      trips={trips}
      onSelect={id => setActiveTripId(id)}
    />
  );
}
