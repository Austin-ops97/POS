import sanitizeHtml from "sanitize-html";

const ALLOWED_TAGS = [
  "p",
  "br",
  "div",
  "span",
  "h1",
  "h2",
  "h3",
  "h4",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "blockquote",
  "ul",
  "ol",
  "li",
  "a",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "hr",
  "figure",
  "figcaption",
  "img",
  "time",
] as const;

export function sanitizeOfficeContent(content: string): string {
  return sanitizeHtml(content, {
    allowedTags: [...ALLOWED_TAGS],
    allowedAttributes: {
      a: ["href", "target", "rel"],
      "*": ["style"],
      div: [
        "style",
        "class",
        "data-office-page-break",
        "data-page-size",
        "data-orientation",
        "data-margin-preset",
        "data-margin-top",
        "data-margin-right",
        "data-margin-bottom",
        "data-margin-left",
      ],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan"],
      img: ["src", "alt", "width", "height", "loading"],
      time: ["datetime"],
    },
    allowedClasses: {
      div: [
        "office-page-break",
        "office-document-layout",
        "office-document-header",
        "office-document-body",
        "office-document-footer",
      ],
      p: ["office-page-number"],
      ul: ["office-checklist"],
    },
    allowedStyles: {
      "*": {
        "text-align": [/^(left|center|right|justify)$/],
        color: [/^#[0-9a-f]{3,8}$/i, /^rgb\([\d\s,]+\)$/],
        "background-color": [/^#[0-9a-f]{3,8}$/i, /^rgb\([\d\s,]+\)$/],
        "font-family": [/^[a-z0-9 ,\-"']+$/i],
        "font-size": [/^\d{1,3}(px|pt|rem|em|%)$/i],
        "font-style": [/^(normal|italic|oblique)$/],
        "font-weight": [/^(normal|bold|bolder|lighter|[1-9]00)$/],
        "line-height": [/^(normal|\d(?:\.\d{1,2})?)$/],
        "margin-left": [/^\d{1,3}(px|pt|rem|em|%)$/i],
        "text-decoration": [/^(none|underline|line-through)( solid)?$/],
      },
    },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: (_tagName, attribs) => ({
        tagName: "a",
        attribs: {
          ...attribs,
          rel: "noopener noreferrer",
          ...(attribs.target === "_blank" ? { target: "_blank" } : {}),
        },
      }),
      img: (_tagName, attribs) => ({
        tagName: "img",
        attribs: {
          src: attribs.src,
          alt: attribs.alt || "",
          loading: "lazy",
          ...(attribs.width ? { width: attribs.width } : {}),
          ...(attribs.height ? { height: attribs.height } : {}),
        },
      }),
    },
    exclusiveFilter: (frame) =>
      frame.tag === "img" && !/^\/api\/office\/files\/[a-z0-9]+$/i.test(frame.attribs.src ?? ""),
  });
}

export function officeContentText(content: string): string {
  return sanitizeHtml(content, { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, " ")
    .trim();
}
