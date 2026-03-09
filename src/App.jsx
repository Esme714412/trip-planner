import { useState, useEffect } from 'react';
import { onAuthStateChanged, getRedirectResult } from 'firebase/auth';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { auth, db } from './firebase/config';
import AuthScreen    from './components/AuthScreen';
import TripSelector  from './components/TripSelector';
import TripApp       from './components/TripApp';

export default function App() {
  const [user,          setUser]          = useState(undefined);
  const [trips,         setTrips]         = useState([]);
  const [activeTripId,  setActiveTripId]  = useState(null);
  const [redirectDone,  setRedirectDone]  = useState(false);

  useEffect(() => {
    getRedirectResult(auth)
      .then((result) => {
        if (result?.user) console.log('Redirect 登入成功：', result.user.email);
      })
      .catch((err) => console.error('Redirect 登入失敗：', err))
      .finally(() => setRedirectDone(true));
  }, []);

  useEffect(() => {
    if (!redirectDone) return;
    const unsub = onAuthStateChanged(auth, u => setUser(u ?? null));
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

  if (!redirectDone || user === undefined) {
    return (
      <div className="min-h-screen bg-indigo-50 flex items-center justify-center">
        <div className="text-indigo-400 text-4xl animate-pulse">✈️</div>
      </div>
    );
  }

  if (!user) return <AuthScreen />;

  if (activeTripId) {
    const tripData = trips.find(t => t.id === activeTripId);
    if (!tripData) { setActiveTripId(null); return null; }
    return (
      <TripApp
        uid={user.uid}
        tripId={activeTripId}
        initialData={tripData}
        onBack={() => setActiveTripId(null)}
      />
    );
  }

  return (
    <TripSelector
      uid={user.uid}
      trips={trips}
      onSelect={id => setActiveTripId(id)}
    />
  );
}