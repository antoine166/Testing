-- GTD-style "context" (@calls, @computer, @errands...): free text rather than a
-- fixed enum, so it adapts to how Antoine actually organizes his next actions
-- instead of being locked into David Allen's original categories.
alter table tasks add column context text;
