import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { stringToBytes } from "../src/utils/unitHelper.ts";

// jsdom defaults intentionally leave scripts and resource loading disabled.
// Tests inspect detached sanitized DOM and never execute supplied markup.
const dom = new JSDOM("");
globalThis.window = dom.window;
globalThis.document = dom.window.document;
const { sanitizeConfigHtml, sanitizeSvg } = await import("../src/utils/safeMarkup.ts");
test.after(() => dom.window.close());
const parse = (source) => {
  const container = document.createElement("div");
  container.innerHTML = source || "";
  return container;
};

test("byte input preserves units, multiplication, precedence, decimals and scientific notation", () => {
  for (const [source, expected] of [
    ["1MB", 1048576], ["1 MB", 1048576], ["5.4MB", 5662310],
    ["6,222,765 MB", 6525042032640], ["128*1024gb", 140737488355328],
    ["1e3kb", 1024000], ["0.2gb", 214748365], ["1024", 1024],
    ["1tb", 1099511627776], ["kb", 1024], ["1.5GiB", 1610612736],
    ["(2 + 3) * 4mb", 20971520], ["2+3*4kb", 14336], ["8/2/2kb", 2048],
    ["4-1-1kb", 2048], ["2*-(-3)kb", 6144], ["+.5e+2 bytes", 50],
  ]) assert.equal(stringToBytes(source), expected, source);
});

test("byte input rejects non-arithmetic syntax, invalid values and excessive work", () => {
  for (const source of [
    "", " ", "abc", "Number(1)MB", "Math.max(1,2)MB", "1;2MB", "[1]MB", "1**2MB",
    "1+MB", "1eMB", "(1+2MB", "1/0MB", "0/0MB", "1e309MB", "-1MB",
    "9999999999999999999PB", "1".repeat(257), "(".repeat(33) + "1" + ")".repeat(33),
  ]) assert.equal(stringToBytes(source), 0, source);
});

test("manifest descriptions preserve formatting, tables, images and safe links", () => {
  const result = parse(sanitizeConfigHtml('<h2>Configuration</h2><p><strong>Read</strong> <em>first</em><br><a href="https://docs.example/guide" target="_blank">Guide</a></p><ul><li>One</li></ul><table><tbody><tr><td colspan="2">Value</td></tr></tbody></table><img src="/assets/icon.png" alt="Icon" width="24">'));
  assert.equal(result.querySelector("h2").textContent, "Configuration");
  assert.equal(result.querySelector("strong").textContent, "Read");
  assert.equal(result.querySelector("td").getAttribute("colspan"), "2");
  assert.equal(result.querySelector("a").getAttribute("href"), "https://docs.example/guide");
  assert.equal(result.querySelector("a").getAttribute("rel"), "noopener noreferrer");
  assert.equal(result.querySelector("img").getAttribute("src"), "/assets/icon.png");
  assert.equal(result.querySelector("img").getAttribute("referrerpolicy"), "no-referrer");
  assert.equal(result.querySelector("li").textContent, "One");
});

test("manifest output excludes application controls, styling and unsupported link schemes", () => {
  const result = parse(sanitizeConfigHtml('<p id="notice" style="color:red" onload="">Description</p><style>p { color: red }</style><script type="application/json">{"example":true}</script><form><input name="username"></form><iframe title="Frame"></iframe><svg><circle r="1"/></svg><a href="data:text/plain,example" target="frame">Example</a>'));
  assert.equal(result.querySelector("script, style, form, input, iframe, svg"), null);
  assert.equal(result.querySelector("p").attributes.length, 0);
  assert.equal(result.querySelector("a").hasAttribute("href"), false);
  assert.equal(result.querySelector("a").hasAttribute("target"), false);
  assert.equal(sanitizeConfigHtml("a".repeat(256 * 1024 + 1)), "");
});

test("static icons preserve geometry, gradients, masks, clip paths and fragment references", () => {
  const result = parse(sanitizeSvg('<svg viewBox="0 0 24 24"><defs><linearGradient id="paint"><stop offset="0" stop-color="#123456"/></linearGradient><clipPath id="clip"><circle r="10"/></clipPath><mask id="mask"><rect width="24" height="24" fill="white"/></mask><path id="shape" d="M0 0L20 20"/></defs><use href="#shape" fill="url(#paint)" mask="url(#mask)" clip-path="url(#clip)" stroke="currentColor"/></svg>'));
  assert.equal(result.querySelector("svg").getAttribute("viewBox"), "0 0 24 24");
  assert.equal(result.querySelector("svg").getAttribute("width"), "100%");
  assert.equal(result.querySelector("path").getAttribute("d"), "M0 0L20 20");
  assert.equal(result.querySelector("linearGradient stop").getAttribute("stop-color"), "#123456");
  const use = result.querySelector("use");
  for (const [name, value] of [["href", "#shape"], ["fill", "url(#paint)"], ["mask", "url(#mask)"], ["clip-path", "url(#clip)"], ["stroke", "currentColor"]]) {
    assert.equal(use.getAttribute(name), value, name);
  }
});

test("inline icons exclude animation, styles, embedded HTML and external resources", () => {
  const result = parse(sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg"><style>path { fill: red }</style><foreignObject><p>Embedded content</p></foreignObject><animate attributeName="opacity" values="0;1" dur="1s"/><animateTransform attributeName="transform" type="rotate"/><set attributeName="opacity" to="1"/><image href="https://images.example/icon.png"/><use href="https://images.example/icon.svg#shape"/><path d="M0 0L2 2" style="fill:red" fill="url(https://images.example/icon.svg#paint)"/></svg>'));
  assert.equal(result.querySelector("animate, animateTransform, set, style, foreignObject, image"), null);
  assert.equal(result.querySelector("use").hasAttribute("href"), false);
  assert.equal(result.querySelector("path").hasAttribute("style"), false);
  assert.equal(result.querySelector("path").hasAttribute("fill"), false);
  assert.equal(result.querySelector("path").getAttribute("d"), "M0 0L2 2");
  assert.equal(sanitizeSvg("<p>Not an icon</p>"), null);
  assert.equal(sanitizeSvg("a".repeat(64 * 1024 + 1)), null);
});
