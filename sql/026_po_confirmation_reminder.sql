-- 발주서는 보냈는데(po_sent_at) 거래처가 발주확인서 회신이 없어 확정일(confirmed_date)이
-- 계속 비어있는 건을 감지해 기안자에게 리마인드하기 위한 컬럼.
-- (자동 회수 웹훅은 거래처가 po-confirm@attude.uk로 회신했을 때만 동작하므로, 거래처가
--  그 주소로 아예 답을 안 하는 경우는 시스템이 스스로 알아챌 방법이 없어 별도로 감지해야 함)
-- Supabase 대시보드 SQL Editor에서 직접 실행하세요.

alter table companies add column if not exists po_confirmation_reminder_days int not null default 3;
alter table approval_documents add column if not exists po_confirmation_reminder_sent_at timestamptz;
