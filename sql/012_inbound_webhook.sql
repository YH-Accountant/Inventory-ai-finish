-- 발주확인서 자동 회신 접수용 알림 타입 추가
-- Supabase 대시보드 SQL Editor에서 직접 실행하세요.

alter table notifications drop constraint notifications_type_check;
alter table notifications add constraint notifications_type_check
  check (type in ('결재요청','승인','반려','발주확인'));
