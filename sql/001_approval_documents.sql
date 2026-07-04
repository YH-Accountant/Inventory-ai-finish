-- 자체 간이 결재 시스템: 품의서/발주서/출고지시서/이동품의서 통합 테이블
-- Supabase 대시보드 SQL Editor에서 직접 실행하세요.
-- 참고: 기존 테이블(products, inventory 등)에 RLS/정책이 걸려있다면 이 두 테이블에도
-- 동일한 정책을 직접 추가해주세요 (이 저장소에 DB 접속 정보가 없어 기존 정책을 확인할 수 없었습니다).

create table approval_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  doc_type text not null check (doc_type in ('발주품의서','출고지시서','이동품의서')),
  status text not null default '대기' check (status in ('대기','승인','반려')),
  warehouse_id uuid references warehouses(id),      -- 입고 대상창고 / 출고 출발창고 / 이동 출발창고
  to_warehouse_id uuid references warehouses(id),   -- 이동품의서 전용: 도착창고
  channel text,                                      -- 출고지시서 전용: 목적 채널
  memo text,
  requested_by text,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table approval_document_items (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references approval_documents(id) on delete cascade,
  product_id uuid not null references products(id),
  quantity numeric not null check (quantity > 0)
);

create index idx_approval_documents_company on approval_documents(company_id);
create index idx_approval_documents_status on approval_documents(company_id, doc_type, status);
create index idx_approval_document_items_document on approval_document_items(document_id);
create index idx_approval_document_items_product on approval_document_items(product_id);
