import { useState, useEffect } from 'react';
import { onAuthStateChanged, getRedirectResult } from 'firebase/auth';
import { collection, onSnapshot, orderBy, query, where, setDoc, doc } from 'firebase/firestore';
import { auth, db } from './firebase/config';
import AuthScreen   from './components/AuthScreen';
import TripSelector from './components/TripSelector';
import TripApp      from './components/TripApp';

export default function App() {
  const [user,              setUser]              = useState(undefined);
  const [userProfile,       setUserProfile]       = useState(null);
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
        await setDoc(doc(db, 'userProfiles', u.uid), {
          uid: u.uid,
          email: u.email,
          displayName: u.displayName || '',
        }, { merge: true });
      }
    });
    return unsub;
  }, [redirectDone]);

  // 即時監聽自己的 userProfile（含 nickname）
  useEffect(() => {
    if (!user) { setUserProfile(null); return; }
    const unsub = onSnapshot(doc(db, 'userProfiles', user.uid), snap => {
      if (snap.exists()) setUserProfile(snap.data());
    });
    return unsub;
  }, [user]);

  useEffect(() => {
    if (!user) { setTrips([]); return; }
    const q = query(collection(db, 'users', user.uid, 'trips'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setTrips(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [user]);

  useEffect(() => {
    if (!user) { setSharedTrips([]); setSharedTripDataMap({}); return; }
    const results = {};
    const unsubE = onSnapshot(
      query(collection(db, 'sharedTrips'), where('editors', 'array-contains', user.uid)),
      snap => {
        snap.docs.forEach(d => { results[d.id] = { ...d.data(), sharedRole: 'editor' }; });
        setSharedTrips(Object.values(results));
      },
      err => console.error('❌ editors 查詢失敗:', err)
    );
    const unsubV = onSnapshot(
      query(collection(db, 'sharedTrips'), where('viewers', 'array-contains', user.uid)),
      snap => {
        snap.docs.forEach(d => { results[d.id] = { ...d.data(), sharedRole: 'viewer' }; });
        setSharedTrips(Object.values(results));
      },
      err => console.error('❌ viewers 查詢失敗:', err)
    );
    return () => { unsubE(); unsubV(); };
  }, [user]);

  useEffect(() => {
    if (sharedTrips.length === 0) { setSharedTripDataMap({}); return; }
    const unsubs = [];
    const dataMap = {};
    sharedTrips.forEach(meta => {
      const tripRef = doc(db, 'users', meta.ownerUid, 'trips', meta.tripId);
      const unsub = onSnapshot(tripRef, snap => {
        if (snap.exists()) {
          dataMap[meta.tripId] = {
            ...snap.data(), id: snap.id,
            ownerUid: meta.ownerUid, sharedRole: meta.sharedRole,
            editors: meta.editors || [], viewers: meta.viewers || [],
          };
        } else { delete dataMap[meta.tripId]; }
        setSharedTripDataMap({ ...dataMap });
      }, err => console.error('❌ 行程資料讀取失敗:', err.code, err.message));
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
    const tripData       = myTrip || sharedTripData;

    if (!tripData) {
      return (
        <div className="min-h-screen bg-indigo-50 flex items-center justify-center">
          <div className="text-indigo-400 text-4xl animate-pulse">✈️</div>
        </div>
      );
    }

    const ownerUid       = myTrip ? user.uid : sharedMeta?.ownerUid;
    const isReadOnly     = sharedMeta?.sharedRole === 'viewer';

    return (
      <TripApp
        uid={ownerUid}
        currentUserUid={user.uid}
        tripId={activeTripId}
        initialData={tripData}
        readOnly={isReadOnly}
        onBack={() => setActiveTripId(null)}
      />
    );
  }

  const sharedTripsWithData = Object.values(sharedTripDataMap);

  return (
    <TripSelector
      uid={user.uid}
      userProfile={userProfile}
      trips={trips}
      sharedTrips={sharedTripsWithData}
      onSelect={id => setActiveTripId(id)}
    />
  );
}
