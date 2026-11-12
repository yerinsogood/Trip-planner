-- 같이가자 여행 플래너 · Supabase 설정
-- Supabase 대시보드 → SQL Editor → 전체 붙여넣기 → Run (한 번만)

create table if not exists public.trips (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.items (
  id text primary key,
  trip_id text not null references public.trips(id) on delete cascade,
  data jsonb not null,
  deleted boolean not null default false,
  updated_at timestamptz not null default now()
);
create index if not exists items_trip_idx on public.items(trip_id);

-- 로그인 없이 링크로 같이 쓰는 방식이라, 앱 키로 읽기/쓰기를 허용
alter table public.trips enable row level security;
alter table public.items enable row level security;

drop policy if exists "trips open" on public.trips;
create policy "trips open" on public.trips for all to anon, authenticated using (true) with check (true);
drop policy if exists "items open" on public.items;
create policy "items open" on public.items for all to anon, authenticated using (true) with check (true);

grant select, insert, update, delete on public.trips, public.items to anon, authenticated;

-- 실시간 반영 켜기
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'items') then
    alter publication supabase_realtime add table public.items;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trips') then
    alter publication supabase_realtime add table public.trips;
  end if;
end $$;

-- 두 여행 미리 만들어두기 (제목·날짜·멤버는 앱에서 수정 가능)
insert into public.trips (id, data) values
 ('dalian-k7m2x9', '{"title":"대련 여행","emoji":"🌊","start":"2026-12-11","end":"2026-12-13","city":"대련","cityZh":"大连","lat":38.914,"lng":121.6147,"members":[],"rate":200}'),
 ('yantai-p4w8qz', '{"title":"옌타이 여행","emoji":"🍎","start":"2026-12-24","end":"2026-12-27","city":"옌타이","cityZh":"烟台","lat":37.4638,"lng":121.4479,"members":[],"rate":200}')
on conflict (id) do nothing;

insert into public.items (id, trip_id, data) values
 ('dalian-k7m2x9-air', 'dalian-k7m2x9', '{"kind":"air","title":"대련 저우수이쯔 국제공항","local":"大连周水子国际机场","lat":38.9657,"lng":121.5386,"day":"2026-12-11","order":1,"memo":"항공편·도착 시간을 적어줘"}'),
 ('yantai-p4w8qz-air', 'yantai-p4w8qz', '{"kind":"air","title":"옌타이 펑라이 국제공항","local":"烟台蓬莱国际机场","lat":37.6572,"lng":120.9872,"day":"2026-12-24","order":1,"memo":"항공편·도착 시간을 적어줘"}')
on conflict (id) do nothing;
