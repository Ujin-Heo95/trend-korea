const KAKAO_JS_KEY = import.meta.env.VITE_KAKAO_JS_KEY || 'de388a2b9aac9a66307a36482a7a3b9c';

export function initKakao(): void {
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

export function shareToKakao({ title, description, imageUrl, linkUrl }: ShareOptions): boolean {
  if (!isKakaoAvailable()) return false;

  Kakao.Share.sendDefault({
    objectType: 'feed',
    content: {
      title,
      description: description || '실시간 이슈 — 한국 커뮤니티 모아보기',
      imageUrl,
      link: { mobileWebUrl: linkUrl, webUrl: linkUrl },
    },
    buttons: [
      { title: '자세히 보기', link: { mobileWebUrl: linkUrl, webUrl: linkUrl } },
    ],
  });
  return true;
}
