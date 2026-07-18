-- GTD's three Limiting Criteria for choosing an action (per the official
-- GTD Workflow Map): Context, Time Available, Resources (energy). Context
-- already exists on tasks; this adds the other two so the Action Choice
-- view can filter on all three together.
alter table tasks add column estimated_minutes int check (estimated_minutes > 0);
alter table tasks add column energy_level text
  check (energy_level in ('low', 'medium', 'high'));
