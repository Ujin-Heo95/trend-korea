# TD-003: RSS → HTML 스크래퍼 전환

- 상태: 승인
- 일자: 2026-03-29
- 부서: 개발

## 맥락

natepann, ruliweb의 RSS 피드가 장기간 0 posts 반환.
pann.nate.com/rss/Talk, bbs.ruliweb.com/best/rss 모두 피드 URL이 변경되었거나 서비스 중단된 것으로 추정.
RSS 기반 todayhumor도 동일 증상.

## 결정

해당 소스를 RSS(rss-parser) 대신 HTML 직접 파싱(axios + cheerio)으로 전환.
- natepann: `pann.nate.com/talk/c20001` HTML 파싱
- ruliweb: `bbs.ruliweb.com/best/now` HTML 파싱
- todayhumor: `todayhumor.co.kr/board/list.php?table=humorbest` HTML 파싱

## 결과

- (+) 수집 재개 가능
- (+) RSS보다 더 많은 메타데이터 추출 가능 (댓글 수, 조회수 등)
- (-) 사이트 DOM 변경 시 셀렉터 깨짐 → `/health` 엔드포인트로 모니터링
- (-) User-Agent 헤더 필요, 차단 가능성 있음
