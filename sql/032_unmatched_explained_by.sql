-- 소명 2단계(직무분리): 소명자(제출) ≠ 소명확인자(승인).
-- sql/031이 만든 컬럼의 의미를 확정:
--   unmatched_review_reason      = 소명 사유 (소명 제출 시 기록)
--   unmatched_reviewed_at/by     = 소명 '확인(승인)' 시각/처리자 = 소명확인자(승인권자)
-- 여기서 추가하는 컬럼:
--   unmatched_explained_at/by    = 소명 '제출' 시각/제출자 = 소명자
-- 미소명(둘 다 null) → 소명 검토중(explained만) → 소명 완료(reviewed까지).
-- nullable 순수 추가라 기존 데이터/판정 영향 없음.
alter table transactions
  add column if not exists unmatched_explained_at timestamptz,
  add column if not exists unmatched_explained_by text;
