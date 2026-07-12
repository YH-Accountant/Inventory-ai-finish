-- 지금까지의 입출고 기록·결재문서·재고수량을 전부 초기화해서 깨끗한 상태로 다시 시작.
-- 제품/창고/채널/거래처/계정 등 마스터데이터는 건드리지 않음.
-- Supabase 대시보드 SQL Editor에서 직접 실행하세요.

-- 1) 결재문서 삭제 (품목·결재선·관련 알림은 on delete cascade로 함께 정리됨)
delete from approval_documents;

-- 2) 입출고 기록 삭제
delete from transactions;

-- 3) 재고 수량 삭제 (기록이 없는 상태에서 수량만 남아있으면 앞뒤가 안 맞으므로 함께 초기화)
delete from inventory;
