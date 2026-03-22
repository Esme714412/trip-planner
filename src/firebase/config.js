import { initializeApp } from 'firebase/app';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

const app  = initializeApp(firebaseConfig);
export const db   = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// IndexedDB 離線持久化
// Safari 私密瀏覽模式不支援，catch 掉不影響正常使用
enableIndexedDbPersistence(db).catch(err => {
  if (err.code === 'failed-precondition') {
    // 多個分頁同時開啟，只有第一個能啟用
    console.warn('[Firestore] persistence failed: multiple tabs open');
  } else if (err.code === 'unimplemented') {
    // 瀏覽器不支援（Safari 私密模式）
    console.warn('[Firestore] persistence not supported in this browser');
  }
});
