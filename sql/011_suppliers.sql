-- 거래처(공급업체) 관리: 여러 거래처 등록, 각자 담당자 이메일 + 기본계약서
-- Supabase 대시보드 SQL Editor에서 직접 실행하세요.

create table suppliers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  name text not null,
  contact_email text,
  contract_file_url text,   -- 기본계약서 파일 (evidence 버킷 재사용, 업로드 안 해도 무방)
  contract_signed_at date,
  created_at timestamptz not null default now()
);
create index idx_suppliers_company on suppliers(company_id);

-- 발주품의서가 등록된 거래처를 참조할 수 있도록 연결 (기존 supplier_name 텍스트는 그대로 유지 — 기안 당시 스냅샷)
alter table approval_documents add column supplier_id uuid references suppliers(id);
