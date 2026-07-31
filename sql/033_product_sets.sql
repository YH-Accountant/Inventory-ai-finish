-- 기획세트 조립(BOM). 세트 제품 1개를 만드는 데 필요한 구성품과 소요 수량을 정의한다.
-- 019에서 제거한 '기획관리'와 다른 점: 판매가·수수료율·마진을 일절 다루지 않고 수량만 다룬다.
-- (원가회계가 아니라 재고 수량 관리이므로 이 시스템의 범위 안)
-- Supabase 대시보드 SQL Editor에서 직접 실행하세요.

create table if not exists product_set_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  set_product_id uuid not null references products(id) on delete cascade,
  component_product_id uuid not null references products(id) on delete cascade,
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now(),
  unique (set_product_id, component_product_id),
  check (set_product_id <> component_product_id)
);

create index if not exists idx_product_set_items_set on product_set_items(set_product_id);

alter table product_set_items enable row level security;

drop policy if exists "product_set_items_company" on product_set_items;
create policy "product_set_items_company" on product_set_items
for all using (company_id = auth_company_id())
with check (company_id = auth_company_id());

-- transactions.type에 '조립' 허용.
-- CHECK 제약이 원래 없었을 수도 있어 drop은 if exists로, add는 not valid로 건다.
-- not valid = 기존 행은 검사하지 않고 앞으로 들어오는 행만 검사 → 어떤 상태에서도 실행이 실패하지 않는다.
alter table transactions drop constraint if exists transactions_type_check;
alter table transactions add constraint transactions_type_check
  check (type in ('입고','출고','이동','조정','조립')) not valid;
