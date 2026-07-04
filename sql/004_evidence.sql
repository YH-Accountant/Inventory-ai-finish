-- 입고·출고 3자 대사 확장: 외부 제3자 증빙(거래명세서/운송장) 첨부
-- Supabase 대시보드 SQL Editor에서 직접 실행하세요.

-- 입고/출고 실물기록에 외부 증빙 첨부 필드
alter table transactions add column evidence_file_url text;
alter table transactions add column evidence_quantity numeric;
alter table transactions add column shipping_type text
  check (shipping_type in ('택배/화물','자차배송','직접픽업')); -- 출고에만 사용, 입고는 null

-- 비공개 스토리지 버킷 (거래명세서/운송장 이미지·PDF — 상대방 정보가 있을 수 있어 비공개)
insert into storage.buckets (id, name, public) values ('evidence', 'evidence', false);

create policy "evidence_insert_authenticated" on storage.objects
  for insert to authenticated with check (bucket_id = 'evidence');
create policy "evidence_select_authenticated" on storage.objects
  for select to authenticated using (bucket_id = 'evidence');
