-- Talent tree MVP: ranked nodes, costs, unlock rules, typed links.
-- Mirrors the local SQLite migration in src/main/db.ts. Purely additive.
-- Must be applied before a desktop build with these columns pushes to the cloud,
-- otherwise the lw_canvas_nodes / lw_canvas_edges upserts fail on unknown columns.

alter table public.lw_canvas_nodes add column if not exists description  text;
alter table public.lw_canvas_nodes add column if not exists max_rank     integer not null default 1;
alter table public.lw_canvas_nodes add column if not exists point_cost   integer not null default 1;
alter table public.lw_canvas_nodes add column if not exists requirements text;  -- JSON NodeRequirement[]
alter table public.lw_canvas_nodes add column if not exists prereq_mode  text    not null default 'all';

alter table public.lw_canvas_edges add column if not exists kind     text    not null default 'related';
alter table public.lw_canvas_edges add column if not exists min_rank integer not null default 1;

-- Same one-time backfill as the desktop app: links that mirror a parent → child
-- relationship become prerequisites.
update public.lw_canvas_edges e
set kind = 'prereq'
from public.lw_canvas_nodes t
where t.id = e.to_id and t.parent_id = e.from_id and e.kind = 'related';
