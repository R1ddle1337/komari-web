import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAgentInstallCommand,
  normalizeGitHubProxy,
  OWNED_SERVER_RELEASES_URL,
} from "../src/utils/ownedSources.ts";

const connectionArgs = ["-e", "https://my-panel.example", "-t", "my-token"];

for (const platform of ["linux", "windows", "macos"]) {
  test(`${platform} installs the owned, fixed release and preserves remote control`, () => {
    const command = buildAgentInstallCommand(platform, connectionArgs);
    const extension = platform === "windows" ? "ps1" : "sh";
    assert.ok(command.includes(`https://raw.githubusercontent.com/R1ddle1337/komari-agent/refs/tags/1.5.18/install.${extension}`));
    assert.ok(command.includes("--install-version"));
    assert.ok(command.includes("1.5.18"));
    assert.ok(command.includes("https://my-panel.example"));
    assert.ok(command.includes("my-token"));
    assert.ok(!command.includes("komari-monitor"));
    assert.ok(!command.includes("--disable-web-ssh"));
    assert.ok(!command.includes("--disable-auto-update"));
    if (platform === "windows") assert.ok(command.includes("-ErrorAction Stop;"));
  });
}

test("Docker uses the owned image and removes only installer flags", () => {
  const command = buildAgentInstallCommand("docker", [
    ...connectionArgs, "--install-dir", "/srv/agent", "--install-ghproxy", "https://proxy.example",
    "--install-service-name", "another-agent", "--gpu", "--include-nics", "eth0",
  ]);
  assert.ok(command.includes("ghcr.io/r1ddle1337/komari-agent:1.5.18"));
  assert.ok(command.includes("--gpu --include-nics eth0"));
  assert.ok(!command.includes("--install-"));
  assert.ok(!command.includes("/srv/agent"));
  assert.ok(!command.includes("proxy.example"));
  assert.ok(!command.includes("another-agent"));
});

test("Docker auto-discovery retains its persisted identity", () => {
  const command = buildAgentInstallCommand("docker", ["--auto-discovery", "discovery-key"], true);
  assert.ok(command.startsWith("touch .komari-auto-discovery.json && "));
  assert.ok(command.includes("-v .komari-auto-discovery.json:/app/auto-discovery.json"));
  assert.ok(command.includes("--auto-discovery discovery-key"));
});

test("an explicit proxy wraps the complete owned HTTPS script URL", () => {
  const command = buildAgentInstallCommand("linux", [
    ...connectionArgs, "--install-ghproxy", "proxy.example/",
  ]);
  assert.ok(command.includes("https://proxy.example/https://raw.githubusercontent.com/R1ddle1337/komari-agent/"));
  assert.equal(normalizeGitHubProxy(" proxy.example/// "), "https://proxy.example");
});

test("installation options and shell quoting survive command generation", () => {
  const args = [...connectionArgs, "--install-dir", "/srv/my agent", "--disable-auto-update"];
  const original = [...args];
  const command = buildAgentInstallCommand("linux", args);
  assert.ok(command.includes("'/srv/my agent'"));
  assert.ok(command.includes("--disable-auto-update"));
  assert.deepEqual(args, original);
});

test("server version notices query only the owned server repository", () => {
  assert.equal(OWNED_SERVER_RELEASES_URL, "https://api.github.com/repos/R1ddle1337/komari/releases?per_page=100");
});

test("the latest UI explicit version and snapshot options are preserved", () => {
  for (const version of ["snapshot", "1.5.14"]) {
    const command = buildAgentInstallCommand("linux", [...connectionArgs, "--install-version", version]);
    assert.ok(command.includes(`--install-version ${version}`));
    assert.equal(command.match(/--install-version/g)?.length, 1);
    assert.ok(command.includes("/R1ddle1337/komari-agent/refs/tags/1.5.18/install.sh"));
  }
});
