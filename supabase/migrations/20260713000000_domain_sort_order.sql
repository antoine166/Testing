-- Lets Antoine set a custom display order for domains (drag-and-drop on the
-- Domains page) instead of always alphabetical. Sidebar, Tasks, and Habits
-- all group by domain using whatever order GET /api/domains returns, so
-- ordering by sort_order there is the only change needed to respect it
-- everywhere.
alter table domains add column sort_order int not null default 0;

-- Existing domains get a stable initial order matching their current
-- alphabetical display, so nothing visibly jumps around on first load.
with ordered as (
  select id, row_number() over (partition by user_id order by name) - 1 as rn
  from domains
)
update domains set sort_order = ordered.rn
from ordered
where domains.id = ordered.id;
