-- GTD-style "Waiting For": a task delegated to someone else, tracked
-- separately from status/domain/project so it keeps its normal filing
-- while also surfacing on the Waiting For list. waiting_since powers the
-- days-outstanding display used to prompt follow-up during review.
alter table tasks add column waiting_on text;
alter table tasks add column waiting_since date;
