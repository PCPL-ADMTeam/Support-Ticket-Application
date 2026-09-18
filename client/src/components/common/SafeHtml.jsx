import DOMPurify from "dompurify";

// Ticket descriptions are authored as rich text (ReactQuill) and stored as
// raw HTML server-side. Sanitize on the way OUT (render time) as well as
// trusting nothing from the API — defense in depth against stored XSS.
export default function SafeHtml({ html, style }) {
  const clean = DOMPurify.sanitize(html || "", {
    ALLOWED_TAGS: ["p", "br", "strong", "em", "u", "s", "ol", "ul", "li", "a", "h1", "h2", "h3", "blockquote", "code", "pre", "span"],
    ALLOWED_ATTR: ["href", "target", "rel"],
  });
  return <div style={style} dangerouslySetInnerHTML={{ __html: clean }} />;
}
