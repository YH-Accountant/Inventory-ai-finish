-- 결재 알림(실시간 토스트 + 알림함)
-- Supabase 대시보드 SQL Editor에서 직접 실행하세요.

create table notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  recipient_user_id uuid not null references profiles(id),
  document_id uuid references approval_documents(id) on delete cascade,
  type text not null check (type in ('결재요청','승인','반려')),
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_notifications_recipient on notifications(recipient_user_id, read_at);
