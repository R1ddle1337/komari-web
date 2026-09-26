import DOMPurify from "dompurify";

const MAX_CONFIG_HTML_LENGTH = 256 * 1024;
const MAX_SVG_LENGTH = 64 * 1024;
const LOCAL_REFERENCE = /^#[\w.:-]+$/;
const LOCAL_PAINT = /^url\(\s*(['"]?)#[\w.:-]+\1\s*\)$/i;

// Manifest descriptions may contain formatting, but cannot add controls, CSS,
// embedded documents or executable content to the administrator's page.
export function sanitizeConfigHtml(source: string): string {
  if (typeof source !== "string" || source.length > MAX_CONFIG_HTML_LENGTH) return "";
  const fragment = DOMPurify.sanitize(source, {
    ALLOWED_TAGS: [
      "a", "b", "blockquote", "br", "caption", "code", "dd", "del", "div", "dl", "dt",
      "em", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "img", "kbd", "li", "ol",
      "p", "pre", "s", "small", "span", "strong", "sub", "sup", "table", "tbody", "td",
      "th", "thead", "tr", "u", "ul",
    ],
    ALLOWED_ATTR: ["alt", "colspan", "height", "href", "rowspan", "src", "target", "title", "width"],
    ALLOW_ARIA_ATTR: false,
    ALLOW_DATA_ATTR: false,
    RETURN_DOM_FRAGMENT: true,
  });
  for (const element of fragment.querySelectorAll("a, img")) {
    const attribute = element.localName === "a" ? "href" : "src";
    const value = element.getAttribute(attribute);
    if (value !== null) {
      try {
        const url = new URL(value, "https://komari.invalid");
        if (!["http:", "https:"].includes(url.protocol) && !(attribute === "href" && url.protocol === "mailto:")) {
          element.removeAttribute(attribute);
        }
      } catch {
        element.removeAttribute(attribute);
      }
    }
    if (element.getAttribute("target") === "_blank") {
      element.setAttribute("rel", "noopener noreferrer");
    } else {
      element.removeAttribute("target");
    }
    if (element.localName === "img") element.setAttribute("referrerpolicy", "no-referrer");
  }
  const container = document.createElement("div");
  container.append(fragment);
  return container.innerHTML;
}

// Inline plugin icons only need static SVG drawing capabilities. SVG animation,
// links, remote resources and CSS must not gain access to the surrounding page.
export function sanitizeSvg(source: string): string | null {
  if (typeof source !== "string" || source.length > MAX_SVG_LENGTH) return null;
  const fragment = DOMPurify.sanitize(source, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: ["use"],
    FORBID_TAGS: ["a", "animate", "animateMotion", "animateTransform", "set", "discard", "foreignObject", "script", "style", "image", "feImage", "cursor"],
    FORBID_ATTR: ["style", "tabindex"],
    ALLOW_DATA_ATTR: false,
    RETURN_DOM_FRAGMENT: true,
  });
  const root = fragment.firstElementChild;
  if (fragment.childElementCount !== 1 || root?.localName !== "svg" || root.namespaceURI !== "http://www.w3.org/2000/svg") return null;

  for (const element of [root, ...root.querySelectorAll("*")]) {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (name === "href" || name === "xlink:href") {
        if (!LOCAL_REFERENCE.test(value)) element.removeAttribute(attribute.name);
      } else if (value.includes("\\") || (/url\s*\(/i.test(value) && !LOCAL_PAINT.test(value))) {
        element.removeAttribute(attribute.name);
      }
    }
  }
  root.setAttribute("width", "100%");
  root.setAttribute("height", "100%");
  root.setAttribute("style", "display: block; width: 100%; height: 100%;");
  return root.outerHTML;
}
