-- 기획관리(기획세트 원가·마진 분석) 기능 제거.
-- 재고 시스템 범위를 벗어나는 회계 성격(판매가·수수료율·마진 계산)이라 정리함.
-- Supabase 대시보드 SQL Editor에서 직접 실행하세요.

-- 1) 기획용으로 분류된 재고를 일반 재고로 병합 (같은 제품+창고+로트 기준)
do $$
declare
  r record;
  existing_id uuid;
begin
  for r in select * from inventory where stock_type = '기획용' loop
    select id into existing_id from inventory
      where product_id = r.product_id
        and warehouse_id = r.warehouse_id
        and lot_number is not distinct from r.lot_number
        and stock_type = '일반'
      limit 1;

    if existing_id is not null then
      update inventory set quantity = quantity + r.quantity, updated_at = now() where id = existing_id;
      delete from inventory where id = r.id;
    else
      update inventory set stock_type = '일반', updated_at = now() where id = r.id;
    end if;
  end loop;
end $$;

-- 2) 기획세트 테이블 삭제
drop table if exists plan_items;
drop table if exists product_plans;

-- 3) 기획용 원가 오버라이드 필드 삭제 (기획용 재고구분과 함께 쓰이던 필드, 이제 미사용)
alter table inventory drop column if exists lot_unit_cost;
