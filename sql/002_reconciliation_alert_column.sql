-- 대사(reconciliation) 알림 24시간 스로틀링용 컬럼
-- Supabase 대시보드 SQL Editor에서 직접 실행하세요.

alter table companies add column last_reconciliation_alert_at timestamptz;
