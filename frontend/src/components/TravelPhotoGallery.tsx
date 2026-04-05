import React, { useMemo } from 'react';
import type { Post } from '../types';

interface PhotoMeta {
  photographer?: string;
  location?: string;
  keywords?: string;
  contentId?: string;
}

function parsePhotoMeta(post: Post): PhotoMeta {
  const m = post.metadata as PhotoMeta | undefined;
  return {
    photographer: m?.photographer,
    location: m?.location ?? post.author,
    keywords: m?.keywords,
    contentId: m?.contentId,
  };
}

export const TravelPhotoGallery: React.FC<{ posts: Post[] }> = ({ posts }) => {
  const photos = useMemo(() =>
    posts.map(p => ({ post: p, meta: parsePhotoMeta(p) })),
    [posts],
  );

  if (photos.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400 dark:text-slate-500">
        <p className="text-lg mb-1">관광사진이 없습니다</p>
        <p className="text-sm">데이터 수집 후 표시됩니다</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {photos.map(({ post, meta }) => (
        <a
          key={post.id}
          href={post.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group relative block rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-sky-300 dark:hover:border-sky-600 transition-colors aspect-[4/3]"
        >
          {post.thumbnail ? (
            <img
              src={post.thumbnail.replace(/^http:\/\//i, 'https://')}
              alt={post.title}
              loading="lazy"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-3xl text-slate-300 dark:text-slate-600">
              📷
            </div>
          )}

          {/* 오버레이 */}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2.5 pt-8">
            <p className="text-xs font-medium text-white line-clamp-1">{post.title}</p>
            <div className="flex items-center justify-between mt-0.5">
              {meta.location && (
                <span className="text-[10px] text-white/80 line-clamp-1">{meta.location}</span>
              )}
              {meta.photographer && (
                <span className="text-[10px] text-white/60 line-clamp-1 ml-auto">{meta.photographer}</span>
              )}
            </div>
          </div>
        </a>
      ))}
    </div>
  );
};
