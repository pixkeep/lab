// Device / environment fingerprint for benchmark context.
//
// Everything here is read locally in the browser and is only included in
// output the user explicitly shares (download / copy / email). Different
// browsers expose different subsets — the gaps are themselves interesting
// (e.g. only Chromium exposes deviceMemory, and even then capped at 8 GB).

export interface DeviceInfo {
  browser: string;         // "Chrome", "Safari", ...
  browserVersion: string;
  engine: 'Blink' | 'Gecko' | 'WebKit' | 'unknown';
  os: string;              // "macOS 14.5", "Windows 10/11", ...
  arch?: string;           // Chromium high-entropy only
  cores?: number;          // hardwareConcurrency
  memoryGB?: number;       // deviceMemory — Chromium only, capped at 8
  gpu?: string;            // WebGL unmasked renderer (may be masked/blocked)
  screen: string;          // "3024x1964 @2x"
  mobile: boolean;
  userAgent: string;
}

function parseUa(ua: string): { browser: string; browserVersion: string; engine: DeviceInfo['engine']; os: string } {
  let browser = 'Unknown';
  let browserVersion = '';
  let m: RegExpMatchArray | null;
  if ((m = ua.match(/Edg(?:e|A|iOS)?\/([\d.]+)/))) { browser = 'Edge'; browserVersion = m[1]; }
  else if ((m = ua.match(/Firefox\/([\d.]+)/))) { browser = 'Firefox'; browserVersion = m[1]; }
  else if ((m = ua.match(/Chrome\/([\d.]+)/))) { browser = 'Chrome'; browserVersion = m[1]; }
  else if ((m = ua.match(/Version\/([\d.]+).*Safari/))) { browser = 'Safari'; browserVersion = m[1]; }

  const engine: DeviceInfo['engine'] =
    /Gecko\/\d/.test(ua) && !/like Gecko/.test(ua) && /Firefox/.test(ua) ? 'Gecko'
    : /AppleWebKit/.test(ua) && !/Chrome|Edg/.test(ua) ? 'WebKit'
    : /Chrome|Edg/.test(ua) ? 'Blink'
    : 'unknown';

  let os = 'Unknown';
  if (/Windows NT/.test(ua)) os = 'Windows';
  else if ((m = ua.match(/Mac OS X ([\d_]+)/))) os = `macOS ${m[1].replace(/_/g, '.')}`;
  else if (/Android/.test(ua)) os = 'Android';
  else if (/iPhone|iPad/.test(ua)) os = 'iOS';
  else if (/Linux/.test(ua)) os = 'Linux';

  return { browser, browserVersion, engine, os };
}

function readGpu(): string | undefined {
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) return undefined;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (!ext) return undefined;
    const renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
    return typeof renderer === 'string' && renderer ? renderer : undefined;
  } catch {
    return undefined; // Firefox resistFingerprinting and friends land here
  }
}

interface NavigatorUAData {
  brands?: Array<{ brand: string; version: string }>;
  mobile?: boolean;
  platform?: string;
  getHighEntropyValues?: (hints: string[]) => Promise<Record<string, string>>;
}

/** Collect everything synchronously available; call enrich() for async high-entropy bits. */
export function collectDeviceInfo(): DeviceInfo {
  const ua = navigator.userAgent;
  const parsed = parseUa(ua);
  const nav = navigator as Navigator & { deviceMemory?: number; userAgentData?: NavigatorUAData };
  const dpr = window.devicePixelRatio || 1;
  return {
    ...parsed,
    cores: navigator.hardwareConcurrency || undefined,
    memoryGB: nav.deviceMemory, // Chromium only; undefined elsewhere
    gpu: readGpu(),
    screen: `${screen.width}x${screen.height} @${dpr}x`,
    mobile: nav.userAgentData?.mobile ?? /Mobi|Android|iPhone|iPad/i.test(ua),
    userAgent: ua,
  };
}

/** Fill in Chromium high-entropy fields (platform version, architecture). No-op elsewhere. */
export async function enrichDeviceInfo(info: DeviceInfo): Promise<DeviceInfo> {
  const nav = navigator as Navigator & { userAgentData?: NavigatorUAData };
  try {
    if (nav.userAgentData?.getHighEntropyValues) {
      const he = await nav.userAgentData.getHighEntropyValues(['platform', 'platformVersion', 'architecture', 'model']);
      if (he.platform) info.os = he.platformVersion ? `${he.platform} ${he.platformVersion}` : he.platform;
      if (he.architecture) info.arch = he.architecture;
    }
  } catch { /* high-entropy hints can be denied — keep the UA parse */ }
  return info;
}
