-- v8 cutover 완료 후 더 이상 read 되지 않는 feature flag row 제거.
-- legacy 코드 경로 완전 삭제로 폴백도 불가능 (lessons_v8_rollout.md §4).
DELETE FROM scoring_config WHERE key = 'scoring_v8_enabled';
