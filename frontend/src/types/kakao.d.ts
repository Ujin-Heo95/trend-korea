interface KakaoShareContent {
  title: string;
  description?: string;
  imageUrl?: string;
  link: { mobileWebUrl: string; webUrl: string };
}

interface KakaoShareButton {
  title: string;
  link: { mobileWebUrl: string; webUrl: string };
}

interface KakaoShareFeedSettings {
  objectType: 'feed';
  content: KakaoShareContent;
  buttons?: KakaoShareButton[];
}

declare namespace Kakao {
  function init(appKey: string): void;
  function isInitialized(): boolean;
  namespace Share {
    function sendDefault(settings: KakaoShareFeedSettings): void;
  }
}
