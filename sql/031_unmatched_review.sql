-- "기록있음·증빙없음"(승인문서 없음/승인수량 초과) 건의 소명/확인 워크플로.
-- 무단출고는 사후승인으로 지울 수 없으므로(대사가 승인 이후 출고만 인정), 대신 관리자가
-- 사유를 기록하고 "확인함" 처리하면 open 플래그는 닫히되 발생 사실·사유·처리자는 남긴다.
-- nullable 순수 추가라 기존 데이터/대사 판정에는 영향이 없다 (미소명=열린 상태로 그대로).
alter table transactions
  add column if not exists unmatched_reviewed_at timestamptz,
  add column if not exists unmatched_reviewed_by text,
  add column if not exists unmatched_review_reason text;
