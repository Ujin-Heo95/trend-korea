# ADR-001: npm workspaces 모노레포

날짜: 2026-03 | 상태: 적용됨

## 맥락

backend(Fastify + TypeScript)와 frontend(React + Vite)를 하나의 저장소에서 관리할 필요.
별도 레포로 분리하면 배포 파이프라인이 복잡해지고, Railway에서 서비스별 설정이 필요.

## 결정

npm workspaces로 `backend/`와 `frontend/`를 단일 레포에서 관리.
루트 `package.json`에 `"workspaces": ["backend", "frontend"]` 설정.

## 결과

- (+) 단일 `npm install`로 양쪽 의존성 설치
- (+) Railway가 각 서비스를 독립 빌드/배포
- (+) 공유 타입이 필요하면 workspace 참조로 해결 가능
- (-) 루트 `package-lock.json`이 커짐
- (-) Railway에서 서비스별 root directory 설정 필요
