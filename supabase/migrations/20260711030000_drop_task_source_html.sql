-- The "View original email" HTML rendering feature was removed (rendered
-- email HTML from marketing/newsletter templates without inline CSS
-- support produced broken layouts — e.g. background/watermark images
-- overlapping text with no way to position them). Plain-text notes remain
-- the only representation of a captured email's body.
alter table tasks drop column source_html;
