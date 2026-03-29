# TD-002: BaseScraper 추상 클래스 패턴

- 상태: 승인
- 일자: 2026-03
- 부서: 개발

## 맥락

10개 이상의 소스를 스크래핑하는데, 각각 파싱 로직은 다르지만
DB 저장(배치 INSERT), 에러 처리, 실행 흐름은 동일.
코드 중복을 막으면서 새 스크래퍼 추가를 쉽게 해야 함.

## 결정

Template Method 패턴의 `BaseScraper` 추상 클래스 사용.
- `fetch()`: abstract — 각 스크래퍼가 구현 (HTML 파싱, RSS, API)
- `saveToDb()`: 공통 — 배치 INSERT, ON CONFLICT DO NOTHING
- `run()`: 공통 — fetch → saveToDb, 에러를 문자열로 래핑 반환

새 스크래퍼는 `fetch()` 하나만 구현하면 됨.

## 결과

- (+) 새 소스 추가에 ~40줄이면 충분
- (+) DB 저장 로직 변경 시 한 곳만 수정
- (+) 에러 처리 일관성 보장
- (-) 상속 기반이라 깊은 커스터마이징 시 유연성 제한
- (-) Pool을 생성자로 주입해야 하므로 테스트 시 mock 필요
