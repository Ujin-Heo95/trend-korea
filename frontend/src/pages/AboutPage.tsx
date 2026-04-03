import React from 'react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export const AboutPage: React.FC = () => {
  useDocumentTitle('서비스 소개');

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">서비스 소개</h1>

      <section className="space-y-6 text-sm text-slate-700 leading-relaxed">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">위클릿이란?</h2>
          <p>
            위클릿은 한국 주요 커뮤니티, 뉴스, YouTube에서 지금 가장 뜨거운 이슈를 자동으로 수집하고
            한눈에 보여주는 트렌드 어그리게이터입니다. 매 10분마다 60개 이상의 소스에서 새 글을 수집하여
            중복을 제거하고, 트렌드 스코어를 계산해 인기도 순으로 정렬합니다.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">주요 기능</h2>
          <ul className="list-disc pl-5 space-y-1.5">
            <li><strong>실시간 수집</strong> — 커뮤니티(디시인사이드, FM코리아, 에펨코리아 등), 뉴스(종합지, 방송, 통신), YouTube 등 60개 이상 소스</li>
            <li><strong>트렌드 스코어링</strong> — 조회수, 댓글, 시간 가속도, 키워드 모멘텀, 교차 검증 등 다중 팩터 기반 랭킹</li>
            <li><strong>3중 중복제거</strong> — MD5 해시, Jaccard 유사도, 썸네일 비교로 같은 뉴스를 하나로 그룹핑</li>
            <li><strong>교차 검증 트렌드</strong> — Google Trends, 네이버 DataLab, 커뮤니티 언급을 교차 분석하여 진짜 트렌드만 표시</li>
            <li><strong>일일 리포트</strong> — 매일 오전 7시 AI 기반 자동 요약 리포트 생성</li>
            <li><strong>박스오피스 / 공연</strong> — KOBIS(영화진흥위원회), KOPIS(공연예술통합전산망) 공식 데이터 연동</li>
            <li><strong>이슈 태그</strong> — AI 키워드 추출로 지금 가장 많이 언급되는 주제 파악</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">데이터 수집 방식</h2>
          <p>
            모든 데이터는 공개된 웹 페이지, 공공 API, RSS 피드에서 자동으로 수집됩니다.
            개인정보는 수집하지 않으며, 원본 게시글의 제목, URL, 조회수, 댓글수 등
            공개 정보만 활용합니다.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">업데이트 주기</h2>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>커뮤니티 / 트렌딩 소스: 10분마다</li>
            <li>뉴스 / RSS 소스: 15분마다</li>
            <li>정부 / 기상 소스: 30분마다</li>
            <li>트렌드 스코어: 5분마다 재계산</li>
            <li>교차 검증 트렌드: 20분마다</li>
            <li>일일 리포트: 매일 오전 7시 (KST)</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">문의</h2>
          <p>
            서비스 관련 문의사항은 아래로 연락 주시기 바랍니다.
          </p>
          <p className="mt-2 text-slate-500">
            이메일: contact@example.com
          </p>
        </div>
      </section>
    </div>
  );
};
