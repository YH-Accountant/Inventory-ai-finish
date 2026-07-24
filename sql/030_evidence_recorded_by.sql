-- 외부증빙(거래명세서/집하확인서)을 "누가 첨부했는지" 기록.
-- 입출고 기록(recorded_by)·결재(acted_by)엔 담당자가 남지만 증빙 첨부엔 없어서,
-- 첨부자 이름을 남겨 문서상세 증빙란에 "날짜 · 수량 · 첨부자 · 보기"로 표시한다.
-- nullable 순수 추가라 기존 데이터/판정에는 영향이 없다.
alter table transactions
  add column if not exists evidence_recorded_by text;
