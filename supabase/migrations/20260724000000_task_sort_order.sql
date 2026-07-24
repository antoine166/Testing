-- Manual task ordering (drag-and-drop): a nullable position, written only
-- when a list is hand-reordered. Null = "no manual position" — with every
-- view ordering by sort_order first (nulls first) and created_at desc
-- second, an untouched account behaves exactly as before (newest first),
-- and new captures surface at the top of a hand-ordered list rather than
-- burying themselves inside it.
alter table tasks add column sort_order int;

create index tasks_sort_order_idx on tasks(sort_order) where sort_order is not null;
