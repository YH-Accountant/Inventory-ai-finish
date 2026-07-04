-- 결재선(다단 승인) 확장: 직급 기반 승인 권한 + 본인기안 자기승인 차단 + 확장 가능한 결재선 구조
-- Supabase 대시보드 SQL Editor에서 직접 실행하세요.

-- 결재 직급 (기존 profiles.role은 본사/창고 운영구분이라 그대로 두고, 별개 축으로 추가)
alter table profiles add column position text
  check (position in ('관리팀원','관리책임자','대표')) default '관리팀원';

-- 기안자 계정 id (본인 기안=본인 승인 차단용)
alter table approval_documents add column requested_by_user_id uuid references profiles(id);

-- 결재선: 문서당 다단 승인 단계를 담는 테이블.
-- 지금은 문서 생성 시 1행(step_order=1)만 자동 생성하지만, 나중에 단계를 늘리려면
-- 문서 생성 로직에서 insert하는 행 수만 늘리면 된다 (승인 판정은 "모든 step 승인 여부"만 확인).
create table approval_steps (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references approval_documents(id) on delete cascade,
  step_order int not null default 1,
  status text not null default '대기' check (status in ('대기','승인','반려')),
  acted_by_user_id uuid references profiles(id),
  acted_by_name text,
  acted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (document_id, step_order)
);
create index idx_approval_steps_document on approval_steps(document_id);

-- (선택) 이미 만든 테스트용 '대기' 문서가 있다면 1단계 결재선을 채워주는 백필
insert into approval_steps (document_id, step_order, status)
select id, 1, '대기' from approval_documents
where status = '대기'
  and not exists (select 1 from approval_steps s where s.document_id = approval_documents.id);
