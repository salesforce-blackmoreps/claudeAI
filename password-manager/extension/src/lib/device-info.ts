export function getDeviceInfo(): { deviceName: string; devicePlatform: string } {
  const platform = navigator.platform || "unknown";
  return { deviceName: `Chrome on ${platform}`, devicePlatform: platform };
}
