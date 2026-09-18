const sanitizeHtml = require("sanitize-html");

// Applied server-side to any user-authored rich text (ticket descriptions,
// comments) before it's persisted — the client also sanitizes on render,
// but the API must never trust that every future consumer will.
function sanitizeRichText(html) {
  return sanitizeHtml(html || "", {
    allowedTags: ["p", "br", "strong", "em", "u", "s", "ol", "ul", "li", "a", "h1", "h2", "h3", "blockquote", "code", "pre", "span"],
    allowedAttributes: { a: ["href", "target", "rel"] },
    allowedSchemes: ["http", "https", "mailto"],
  });
}

module.exports = { sanitizeRichText };
