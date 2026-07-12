-- 이동품의서(창고 간 이동) 기능 제거.
-- 창고가 1개(충주창고)뿐이라 창고 간 이동이라는 개념 자체가 실제로 쓰인 적이 없음.
-- Supabase 대시보드 SQL Editor에서 직접 실행하세요.

-- 1) 기존 이동품의서 문서 삭제 (approval_document_items/approval_steps는 on delete cascade로 함께 정리됨)
delete from approval_documents where doc_type = '이동품의서';

-- 2) 기존 이동 트랜잭션 삭제 전, 관련 재고를 원래(입고 시점 창고)로 되돌릴 방법이 없으므로
--    실제로 이동 기록이 있는 회사가 있는지 먼저 확인만 하고(삭제하지 않음), 있으면 수동으로 검토.
--    (창고가 1개뿐인 구조라 정상적으로는 이동 트랜잭션이 존재하지 않아야 함)
do $$
declare
  cnt int;
begin
  select count(*) into cnt from transactions where type = '이동';
  if cnt > 0 then
    raise notice '이동 트랜잭션 %건이 남아있습니다 — 화면에서는 계속 조회/삭제 가능하니 수동으로 확인하세요.', cnt;
  end if;
end $$;

-- 3) doc_type 체크 제약에서 이동품의서 제거
alter table approval_documents drop constraint if exists approval_documents_doc_type_check;
alter table approval_documents add constraint approval_documents_doc_type_check
  check (doc_type in ('발주품의서','출고지시서'));

-- 4) 이동품의서 전용이었던 도착창고 컬럼 삭제
alter table approval_documents drop column if exists to_warehouse_id;
