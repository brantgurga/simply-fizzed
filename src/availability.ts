export function isHostnameEnabled(hostname: string, enabledHostnames: string): boolean {
  const normalizedHostname = hostname.trim().toLowerCase();

  return enabledHostnames
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .some((entry) => entry.length > 0 && entry === normalizedHostname);
}
