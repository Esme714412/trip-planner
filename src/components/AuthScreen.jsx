import { signInWithPopup, signInWithRedirect, getRedirectResult } from 'firebase/auth';
import { auth, googleProvider } from '../firebase/config';
import { Plane } from 'lucide-react';
import { useEffect } from 'react';

const C = {
  primary:      '#48749E',
  primaryLight: '#EAF0F6',
  ink:          '#111111',
  muted:        '#9CA3AF',
  card:         '#FFFFFF',
  border:       '#E8ECF0',
};

export default function AuthScreen() {
  useEffect(() => {
    getRedirectResult(auth).catch(err => {
      console.error(err);
      alert('登入失敗，請確認網路連線後再試。');
    });
  }, []);

  const handleGoogleLogin = async () => {
    try {
      const isWebView = /(Line|FBAN|FBAV|Instagram)/i.test(navigator.userAgent);
      if (isWebView) {
        await signInWithRedirect(auth, googleProvider);
      } else {
        await signInWithPopup(auth, googleProvider);
      }
    } catch (err) {
      alert('登入失敗，請確認網路連線後再試。');
      console.error(err);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{background:'#F4F7FA', fontFamily:"'DM Sans','Noto Sans TC',sans-serif"}}>

      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;900&display=swap');`}</style>

      <div className="w-full rounded-3xl p-8 text-center"
        style={{background:C.card, maxWidth:'360px', boxShadow:'0 8px 40px rgba(72,116,158,0.12)'}}>

        {/* Logo */}
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
          style={{background:C.primaryLight}}>
          <Plane size={30} style={{color:C.primary}}/>
        </div>

        <h1 className="text-2xl font-black mb-1" style={{color:C.ink, letterSpacing:'-0.03em'}}>
          旅行計畫助手
        </h1>
        <p className="text-sm mb-8" style={{color:C.muted}}>
          跨裝置同步・多人協作・一鍵分帳
        </p>

        {/* Google 登入按鈕 */}
        <button
          onClick={handleGoogleLogin}
          className="w-full flex items-center justify-center gap-3 py-3.5 px-6 rounded-2xl font-bold text-sm transition-all active:scale-[0.98]"
          style={{
            background:C.card,
            border:`1.5px solid ${C.border}`,
            color:C.ink,
            boxShadow:'0 2px 8px rgba(0,0,0,0.06)',
          }}>
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          使用 Google 帳號登入
        </button>

        <p className="text-xs mt-6" style={{color:C.muted}}>
          登入即視為同意服務條款。資料僅供個人使用。
        </p>
      </div>
    </div>
  );
}
