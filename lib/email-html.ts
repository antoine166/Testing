import sanitizeHtml from "sanitize-html";

const MAX_HTML_LENGTH = 200_000;

const ALLOWED_TAGS = [
  "p", "br", "b", "strong", "i", "em", "u", "s",
  "a", "ul", "ol", "li", "blockquote", "hr",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "span", "div", "table", "thead", "tbody", "tr", "td", "th", "img",
];

// No `style` attribute support: email HTML leans heavily on inline CSS for
// color/layout, but allowing it invites inconsistent rendering inside our
// own UI chrome. Structure (headings, lists, links, emphasis) survives;
// custom fonts/colors don't — a deliberate tradeoff, not a bug.
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: {
    // target/rel/loading/referrerpolicy aren't in the source email — they're
    // added by transformTags below, but still have to be allow-listed here
    // since attribute filtering runs after transforms.
    a: ["href", "title", "target", "rel"],
    img: ["src", "alt", "width", "height", "loading", "referrerpolicy"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  disallowedTagsMode: "discard",
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer" }),
    img: sanitizeHtml.simpleTransform("img", { loading: "lazy", referrerpolicy: "no-referrer" }),
  },
};

/** Sanitizes raw email HTML for safe storage + later rendering via dangerouslySetInnerHTML. */
export function sanitizeEmailHtml(html: string): string {
  return sanitizeHtml(html, OPTIONS).slice(0, MAX_HTML_LENGTH);
}
