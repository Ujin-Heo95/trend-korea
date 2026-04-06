const KAKAO_JS_KEY = import.meta.env.VITE_KAKAO_JS_KEY ?? '';
const KAKAO_SDK_URL = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js';

let loadPromise: Promise<void> | null = null;

function loadKakaoSDK(): Promise<void> {
  if (loadPromise) return loadPromise;
  if (typeof Kakao !== 'undefined') {
    loadPromise = Promise.resolve();
    return loadPromise;
  }
  loadPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = KAKAO_SDK_URL;
    script.crossOrigin = 'anonymous';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Kakao SDK load failed'));
    document.head.appendChild(script);
  });
  return loadPromise;
}

export async function initKakao(): Promise<void> {
  if (!KAKAO_JS_KEY) return;
  await loadKakaoSDK();
  if (typeof Kakao === 'undefined') return;
  if (Kakao.isInitialized()) return;
  Kakao.init(KAKAO_JS_KEY);
}

export function isKakaoAvailable(): boolean {
  return typeof Kakao !== 'undefined' && Kakao.isInitialized();
}

interface ShareOptions {
  title: string;
  description?: string;
  imageUrl?: string;
  linkUrl: string;
}

export async function shareToKakao({ title, description, imageUrl, linkUrl }: ShareOptions): Promise<boolean> {
  await initKakao();
  if (!isKakaoAvailable()) return false;

  Kakao.Share.sendDefault({
    objectType: 'feed',
    content: {
      title,
      description: description || '위클릿 — 실시간 트렌드 모아보기',
      imageUrl,
      link: { mobileWebUrl: linkUrl, webUrl: linkUrl },
    },
    buttons: [
      { title: '자세히 보기', link: { mobileWebUrl: linkUrl, webUrl: linkUrl } },
    ],
  });
  return true;
}
