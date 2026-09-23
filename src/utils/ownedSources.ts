import { quotePowerShellArg, quoteShellArg, quoteShellArgs } from "./shellQuote.ts";

export const OWNED_SERVER_REPOSITORY = "R1ddle1337/komari";
export const OWNED_AGENT_REPOSITORY = "R1ddle1337/komari-agent";
export const OWNED_AGENT_VERSION = "1.5.18";
export const OWNED_SERVER_RELEASES_URL =
  `https://api.github.com/repos/${OWNED_SERVER_REPOSITORY}/releases?per_page=100`;
export const OWNED_SERVER_README_URL =
  `https://raw.githubusercontent.com/${OWNED_SERVER_REPOSITORY}/refs/heads/owned/README.md`;
export const OWNED_SERVER_README_PAGE =
  `https://github.com/${OWNED_SERVER_REPOSITORY}/blob/owned/README.md`;

type InstallPlatform = "linux" | "windows" | "macos" | "docker";

export function normalizeGitHubProxy(proxy: string): string {
  const trimmed = proxy.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function buildAgentInstallCommand(
  platform: InstallPlatform,
  args: string[],
  autoDiscovery = false,
): string {
  if (platform === "docker") {
    const installOnlyFlags = new Set([
      "--install-ghproxy", "--install-dir", "--install-service-name", "--install-version",
    ]);
    const dockerArgs: string[] = [];
    for (let i = 0; i < args.length; i++) {
      if (installOnlyFlags.has(args[i])) {
        i++;
      } else {
        dockerArgs.push(args[i]);
      }
    }
    const prepareIdentity = autoDiscovery ? "touch .komari-auto-discovery.json && " : "";
    const identityMount = autoDiscovery
      ? "-v .komari-auto-discovery.json:/app/auto-discovery.json "
      : "";
    return prepareIdentity + "docker run -d --name komari-agent --restart=always " +
      identityMount + `ghcr.io/${OWNED_AGENT_REPOSITORY.toLowerCase()}:${OWNED_AGENT_VERSION} ` +
      quoteShellArgs(dockerArgs);
  }

  // 安装脚本及初始二进制固定到同一自管版本；后续自更新仍由自管 Agent 决定。
  const scriptFile = platform === "windows" ? "install.ps1" : "install.sh";
  let scriptUrl = `https://raw.githubusercontent.com/${OWNED_AGENT_REPOSITORY}/refs/tags/${OWNED_AGENT_VERSION}/${scriptFile}`;
  const proxyIndex = args.indexOf("--install-ghproxy");
  if (proxyIndex >= 0 && args[proxyIndex + 1]) {
    scriptUrl = `${normalizeGitHubProxy(args[proxyIndex + 1])}/${scriptUrl}`;
  }
  const installArgs = args.includes("--install-version")
    ? [...args]
    : [...args, "--install-version", OWNED_AGENT_VERSION];
  switch (platform) {
    case "windows":
      return "powershell.exe -NoProfile -ExecutionPolicy Bypass -Command " +
        `"iwr ${quotePowerShellArg(scriptUrl)} -UseBasicParsing -OutFile 'install.ps1' -ErrorAction Stop; & '.\\install.ps1' ` +
        installArgs.map(quotePowerShellArg).join(" ") + '"';
    case "macos":
      return `zsh <(curl -fsSL ${quoteShellArg(scriptUrl)}) ` + quoteShellArgs(installArgs);
    case "linux":
      return `wget -qO- ${quoteShellArg(scriptUrl)} | sudo bash -s -- ` + quoteShellArgs(installArgs);
  }
}
