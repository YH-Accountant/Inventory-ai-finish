-- 전체 테이블 RLS(Row Level Security) 활성화.
-- 지금까지는 company_id 필터링을 프론트엔드 쿼리(.eq('company_id', ...))에서만 걸었고,
-- DB 자체는 RLS가 꺼져있어서 API 키만 있으면 다른 회사 데이터까지 다 읽고 쓸 수 있는 상태였음.
-- 겸사겸사 "본인이 기안한 문서를 본인이 승인/반려"하는 것도 approval_steps 정책에서 DB 단으로 막음
-- (지금까지는 화면의 버튼 disabled 속성 하나로만 막고 있었음).
--
-- 문제 생기면 즉시 롤백: `alter table 테이블명 disable row level security;`
--
-- Supabase 대시보드 SQL Editor에서 직접 실행하세요.

-- ── 0) 헬퍼 함수: 내 소속 회사 id ──
-- profiles 테이블 자신을 참조하는 정책에서 그대로 서브쿼리를 쓰면 RLS가 무한 재귀할 수 있어서,
-- SECURITY DEFINER 함수로 우회한다 (Supabase 공식 권장 패턴).
create or replace function auth_company_id()
returns uuid
language sql
security definer
stable
as $$
  select company_id from profiles where id = auth.uid()
$$;

-- ── 1) companies ──
-- 회원가입 화면(app/login/page.tsx)이 로그인 전(anon) 상태로 회사명 조회/생성/삭제(가입 실패 롤백)를
-- 하기 때문에, 조회/생성/삭제는 열어두고 수정만 같은 회사 소속으로 제한한다.
-- (조회를 완전히 막으면 "동일 회사명 있으면 합류" 로직 자체가 깨짐)
alter table companies enable row level security;

create policy "companies_select_all" on companies
for select using (true);

create policy "companies_insert_signup" on companies
for insert with check (true);

create policy "companies_update_own" on companies
for update using (id = auth_company_id())
with check (id = auth_company_id());

create policy "companies_delete_signup_rollback" on companies
for delete using (true);

-- ── 2) profiles ──
create policy "profiles_select_self_or_company" on profiles
for select using (id = auth.uid() or company_id = auth_company_id());

alter table profiles enable row level security;

create policy "profiles_insert_self" on profiles
for insert with check (id = auth.uid());

create policy "profiles_update_self" on profiles
for update using (id = auth.uid())
with check (id = auth.uid());

-- ── 3) company_id 컬럼을 직접 가진 테이블들 ──
alter table products enable row level security;
create policy "products_company" on products
for all using (company_id = auth_company_id())
with check (company_id = auth_company_id());

alter table warehouses enable row level security;
create policy "warehouses_company" on warehouses
for all using (company_id = auth_company_id())
with check (company_id = auth_company_id());

alter table inventory enable row level security;
create policy "inventory_company" on inventory
for all using (company_id = auth_company_id())
with check (company_id = auth_company_id());

alter table transactions enable row level security;
create policy "transactions_company" on transactions
for all using (company_id = auth_company_id())
with check (company_id = auth_company_id());

alter table suppliers enable row level security;
create policy "suppliers_company" on suppliers
for all using (company_id = auth_company_id())
with check (company_id = auth_company_id());

alter table product_plans enable row level security;
create policy "product_plans_company" on product_plans
for all using (company_id = auth_company_id())
with check (company_id = auth_company_id());

-- ── 4) approval_documents ──
-- insert/update를 분리한다: insert에는 "본인이 기안자로만 등록 가능"(타인 사칭 방지)을 추가로 걸지만,
-- update(승인 처리 등은 approval_steps 쪽에서, 확정일/발송 등은 여기서)에 그 조건을 걸면
-- "기안자 본인만 수정 가능"이 되어 승인자가 아예 승인 자체를 못 하게 되므로 update에는 걸지 않는다.
alter table approval_documents enable row level security;

create policy "approval_documents_select" on approval_documents
for select using (company_id = auth_company_id());

create policy "approval_documents_insert" on approval_documents
for insert with check (
  company_id = auth_company_id()
  and (requested_by_user_id is null or requested_by_user_id = auth.uid())
);

create policy "approval_documents_update" on approval_documents
for update using (company_id = auth_company_id())
with check (company_id = auth_company_id());

create policy "approval_documents_delete" on approval_documents
for delete using (company_id = auth_company_id());

-- ── 5) approval_document_items (부모 문서를 통해서만 회사 판별) ──
alter table approval_document_items enable row level security;
create policy "approval_document_items_via_parent" on approval_document_items
for all using (
  exists (select 1 from approval_documents d where d.id = approval_document_items.document_id and d.company_id = auth_company_id())
)
with check (
  exists (select 1 from approval_documents d where d.id = approval_document_items.document_id and d.company_id = auth_company_id())
);

-- ── 6) approval_steps ──
-- 조회/생성/삭제는 같은 회사 소속이면 허용하되, "승인/반려 처리(update)"만큼은
-- 본인이 기안한 문서면 DB 단에서 절대 못 하게 막는다 (자기승인 버그의 근본 차단 지점).
alter table approval_steps enable row level security;

create policy "approval_steps_select" on approval_steps
for select using (
  exists (select 1 from approval_documents d where d.id = approval_steps.document_id and d.company_id = auth_company_id())
);

create policy "approval_steps_insert" on approval_steps
for insert with check (
  exists (select 1 from approval_documents d where d.id = approval_steps.document_id and d.company_id = auth_company_id())
);

create policy "approval_steps_update_no_self_approval" on approval_steps
for update using (
  exists (
    select 1 from approval_documents d
    where d.id = approval_steps.document_id
      and d.company_id = auth_company_id()
      and (d.requested_by_user_id is null or d.requested_by_user_id <> auth.uid())
  )
)
with check (
  acted_by_user_id is null or acted_by_user_id = auth.uid()
);

create policy "approval_steps_delete" on approval_steps
for delete using (
  exists (select 1 from approval_documents d where d.id = approval_steps.document_id and d.company_id = auth_company_id())
);

-- ── 7) plan_items (부모 product_plans를 통해서만 회사 판별) ──
alter table plan_items enable row level security;
create policy "plan_items_via_parent" on plan_items
for all using (
  exists (select 1 from product_plans p where p.id = plan_items.plan_id and p.company_id = auth_company_id())
)
with check (
  exists (select 1 from product_plans p where p.id = plan_items.plan_id and p.company_id = auth_company_id())
);

-- ── 8) notifications ──
-- 받는 사람 기준으로만 열람/수정 가능. 생성은 같은 회사 안에서 누구나(다른 사람에게 알림을 보낼 때) 허용.
alter table notifications enable row level security;

create policy "notifications_select_own" on notifications
for select using (recipient_user_id = auth.uid());

create policy "notifications_insert_company" on notifications
for insert with check (company_id = auth_company_id());

create policy "notifications_update_own" on notifications
for update using (recipient_user_id = auth.uid())
with check (recipient_user_id = auth.uid());

create policy "notifications_delete_own" on notifications
for delete using (recipient_user_id = auth.uid());
