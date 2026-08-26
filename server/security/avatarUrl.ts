export function isSafeAvatarUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.username === ""
      && url.password === ""
      && Boolean(url.hostname);
  } catch {
    return false;
  }
}
