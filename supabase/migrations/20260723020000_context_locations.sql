-- The task "Context" field is now specifically a GTD Location (Computer,
-- Home, Gym, Phone, Errands), because Time and Energy — which used to be
-- mixed into the free-text context list — became their own structured
-- dropdowns on the task form. The `contexts` table stays the editable
-- source of the Location list (managed in Settings); this just cleans its
-- seed so the dropdown shows locations only.
--
-- Remove the non-location entries the 20260719010000 seed added (the time
-- and energy buckets, and "deep-work"). Only touches those exact seeded
-- names — anything the user created themselves is left alone. A task that
-- still references one of these keeps its tasks.context value (the Location
-- dropdown preserves an unknown current value as an extra option), so no
-- task data is lost.
delete from contexts
where name in (
  '0-15 min', '15-30 min', '30-60 min', '60+ min',
  'High Energy', 'Low Energy', 'deep-work'
);

-- Ensure the five locations exist for every user (idempotent).
insert into contexts (user_id, name)
select u.id, v.name
from auth.users u
cross join (values ('Computer'), ('Home'), ('Gym'), ('Phone'), ('Errands')) as v(name)
on conflict (user_id, name) do nothing;
