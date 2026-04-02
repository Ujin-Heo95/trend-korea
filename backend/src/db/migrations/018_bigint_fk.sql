-- 018_bigint_fk.sql: INTEGER FK → BIGINT 타입 정합
-- posts.id가 BIGSERIAL(bigint)이므로 참조하는 FK 컬럼도 BIGINT로 통일
-- PostgreSQL에서 int→bigint 변환은 메타데이터 변경만으로 안전하게 수행됨

ALTER TABLE keyword_extractions ALTER COLUMN post_id TYPE BIGINT;
ALTER TABLE post_votes ALTER COLUMN post_id TYPE BIGINT;
