# 기술 부채 — 미해결 항목

> 해결된 항목: `docs/archive/tech-debt-resolved.md`
> 2026-04-11 현행화. 해결 완료 항목 제거.

---

## 관찰 항목

### fmkorea — WASM 봇 차단

3-전략 폴백(fetchHtml → 쿠키 바이패스+RSS → 쿠키 바이패스+HTML) 재작성 완료.
WASM 봇 차단이 강력하여 성공률 미보장. 배포 후 24h 모니터링 필요, 개선 안되면 Apify/Puppeteer 전환 또는 disable.

### YouTube RSS 레이트 리밋

4개 뉴스 채널 sr 55-61%. priority low(30분)로 완화했으나 추가 개선 불가.
허용 가능 수준으로 판단.

### airkorea — data.go.kr 간헐적 500

sr ~79%. data.go.kr API의 구조적 한계. 현상 유지.
