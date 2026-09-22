import assert from "node:assert/strict";
import test, { after } from "node:test";
import { parseGuideState, selectAdminGuide } from "../src/components/onboarding/guideState.ts";
import { formatLoginRedirect, resolveLoginRedirect, loginPath } from "../src/utils/loginRedirect.ts";
import { saveThemeSettings } from "../src/utils/saveThemeSettings.ts";

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
Object.defineProperty(globalThis, "window", {
  configurable: true, value: { location: { origin: "https://panel.example" } },
});
Object.defineProperty(globalThis, "navigator", { configurable: true, value: {} });
after(() => {
  for (const [name, descriptor] of [["window", originalWindow], ["navigator", originalNavigator]]) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
});

// 模拟全量替换的后端，检查引导保存不会覆盖其他主题配置。
function themeService(t, initial = { unrelated: "keep-me" }) {
  const service = { theme: "default", values: initial, methods: [], failures: 0 };
  t.mock.method(globalThis, "fetch", async (_url, options = {}) => {
    const method = options.method ?? "GET";
    service.methods.push(method);
    if (method === "GET") {
      return Response.json({ data: { theme: service.theme, theme_settings: service.values } });
    }
    if (service.failures > 0) {
      service.failures--;
      return new Response("failed", { status: 503 });
    }
    service.values = JSON.parse(options.body);
    return Response.json({ status: "success" });
  });
  return service;
}

test("guide state tolerates old data and ignores unknown guide IDs", () => {
  assert.deepEqual(parseGuideState(null), { seen: [], workbenchOpened: false });
  assert.deepEqual(parseGuideState({ seen: ["terminal", "install", "install", "unknown"], workbenchOpened: "true" }), {
    seen: ["install", "terminal"], workbenchOpened: false,
  });
});

test("guide selection follows node state without replaying dismissed guidance", () => {
  assert.equal(selectAdminGuide(0, parseGuideState(null)), "install");
  assert.equal(selectAdminGuide(1, parseGuideState(null)), "workbench");
  assert.equal(selectAdminGuide(1, { seen: [], workbenchOpened: true }), "notifications");
  assert.equal(selectAdminGuide(0, { seen: ["install", "notifications", "markets"], workbenchOpened: false }), null);
});

test("login redirects remain on the panel origin", () => {
  for (const unsafe of [null, "https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)"]) {
    assert.equal(formatLoginRedirect(unsafe), null);
    assert.equal(resolveLoginRedirect(unsafe), "/admin/dashboard");
  }
  assert.equal(resolveLoginRedirect("/terminal?uuid=node#files"), "/terminal?uuid=node#files");
});

test("login path preserves an internal destination and its query", () => {
  assert.equal(loginPath("/admin", "?tab=nodes"), "/admin/login?redirect=%2Fadmin%3Ftab%3Dnodes");
  assert.equal(loginPath("//evil.example"), "/admin/login");
});

test("saving guide settings retains unrelated settings from a fresh read", async (t) => {
  const service = themeService(t, { unrelated: "keep-me", layout: [1, 2] });
  await saveThemeSettings("default", { guide: "install" });
  assert.deepEqual(service.values, { unrelated: "keep-me", layout: [1, 2], guide: "install" });
  assert.deepEqual(service.methods, ["GET", "POST"]);
});

test("concurrent saves reread the latest settings and retain both changes", async (t) => {
  const service = themeService(t);
  await Promise.all([
    saveThemeSettings("default", { dismissed: ["install"] }),
    saveThemeSettings("default", (current) => ({ dismissed: [...current.dismissed, "notifications"] })),
  ]);
  assert.deepEqual(service.values, { unrelated: "keep-me", dismissed: ["install", "notifications"] });
  assert.deepEqual(service.methods, ["GET", "POST", "GET", "POST"]);
});

test("a failed save does not prevent a later successful save", async (t) => {
  const service = themeService(t);
  service.failures = 1;
  await assert.rejects(saveThemeSettings("default", { failed: true }), /HTTP 503/);
  await saveThemeSettings("default", { recovered: true });
  assert.deepEqual(service.values, { unrelated: "keep-me", recovered: true });
});

test("a changed active theme prevents stale settings from being written", async (t) => {
  const service = themeService(t);
  service.theme = "another-theme";
  await assert.rejects(saveThemeSettings("default", { stale: true }), /active theme has changed/);
  assert.deepEqual(service.methods, ["GET"]);
  assert.deepEqual(service.values, { unrelated: "keep-me" });
});

test("invalid theme data is rejected before attempting a write", async (t) => {
  const service = themeService(t, []);
  await assert.rejects(saveThemeSettings("default", { invalid: true }), /Invalid theme settings response/);
  assert.deepEqual(service.methods, ["GET"]);
});
