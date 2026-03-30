import React from 'react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export const PrivacyPage: React.FC = () => {
  useDocumentTitle('개인정보처리방침');

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">개인정보처리방침</h1>

      <div className="space-y-6 text-sm text-slate-700 leading-relaxed">
        <p>
          실시간 이슈(이하 &quot;서비스&quot;)는 이용자의 개인정보를 중요시하며,
          &laquo;개인정보 보호법&raquo;을 준수합니다. 본 개인정보처리방침은 서비스가
          수집하는 정보의 종류, 이용 목적, 보유 기간 및 이용자의 권리에 대해 안내합니다.
        </p>

        <section>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">1. 수집하는 개인정보 항목</h2>
          <p>서비스는 회원가입을 요구하지 않으며, 최소한의 정보만 자동 수집합니다.</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li><strong>자동 수집 항목:</strong> 방문 일시, 페이지 조회 기록, 브라우저 유형, 운영체제, 화면 해상도, 언어 설정</li>
            <li><strong>수집하지 않는 항목:</strong> 이름, 이메일, 전화번호, IP 주소, 쿠키 기반 추적 정보</li>
          </ul>
          <p className="mt-2">
            서비스는 개인정보 보호를 위해 쿠키 없는 분석 도구(Umami)를 사용하며,
            개별 이용자를 식별할 수 없는 익명 통계만 수집합니다.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">2. 개인정보 수집 및 이용 목적</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>서비스 이용 통계 분석 (방문자 수, 인기 페이지 등)</li>
            <li>서비스 품질 개선 및 안정성 모니터링</li>
            <li>콘텐츠 제공 및 기능 개선</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">3. 개인정보 보유 및 이용 기간</h2>
          <p>
            수집된 익명 통계 데이터는 수집일로부터 <strong>1년간</strong> 보유 후 자동 삭제됩니다.
            이용자가 삭제를 요청할 경우 지체 없이 처리합니다.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">4. 개인정보의 제3자 제공</h2>
          <p>서비스는 이용자의 개인정보를 원칙적으로 제3자에게 제공하지 않습니다. 다만, 아래의 경우는 예외입니다.</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>법령에 의거하거나, 수사 목적으로 법령에 정해진 절차에 따라 요청이 있는 경우</li>
          </ul>
          <p className="mt-2">서비스에서 사용하는 외부 서비스:</p>
          <ul className="list-disc pl-5 mt-1 space-y-1">
            <li><strong>Umami Cloud</strong> — 쿠키 없는 웹 분석 (GDPR/PIPA 준수, 개인정보 미수집)</li>
            <li><strong>Sentry</strong> — 에러 모니터링 (오류 발생 시 기술적 정보만 전송)</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">5. 쿠키 사용</h2>
          <p>
            서비스는 쿠키를 사용하지 않습니다. 분석 도구(Umami)도 쿠키 없이 동작하며,
            이용자를 추적하거나 식별하지 않습니다.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">6. 이용자의 권리</h2>
          <p>이용자는 언제든지 다음의 권리를 행사할 수 있습니다.</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>개인정보 수집 및 이용에 대한 동의 철회</li>
            <li>개인정보 열람, 정정, 삭제 요청</li>
            <li>개인정보 처리 정지 요청</li>
          </ul>
          <p className="mt-2">
            위 권리 행사는 아래 연락처를 통해 요청하실 수 있으며,
            요청 접수 후 지체 없이 처리하겠습니다.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">7. 개인정보 보호책임자</h2>
          <ul className="list-none space-y-1">
            <li><strong>담당자:</strong> 서비스 운영자</li>
            <li><strong>이메일:</strong> contact@example.com</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">8. 방침 변경</h2>
          <p>
            본 개인정보처리방침은 법령, 정책, 보안 기술의 변경에 따라 수정될 수 있습니다.
            변경 시 서비스 내 공지를 통해 안내합니다.
          </p>
          <p className="mt-2 text-slate-500">시행일: 2026년 3월 31일</p>
        </section>
      </div>
    </div>
  );
};
