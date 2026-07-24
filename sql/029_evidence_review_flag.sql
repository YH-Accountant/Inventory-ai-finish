-- 외부증빙(거래명세서/집하확인서) 자동검증 결과 플래그.
-- 발주확인서(po_confirmation_review_needed)와 동일한 패턴을 실물기록(transactions)의 외부증빙에 적용한다.
-- 첨부 시 파일에서 발송자/운송장번호/수량(입고=품목+수량)을 추출·대조해서:
--   통과 -> 기존대로 증빙완료
--   불일치·추출불가 -> 이 플래그로 "검토 필요" 상태를 남겨 완료 판정에서 제외
-- default false 라서 기존 행/완료 판정에는 아무 영향이 없다 (순수 추가).
alter table transactions
  add column if not exists evidence_review_needed boolean not null default false,
  add column if not exists evidence_review_reason text;
