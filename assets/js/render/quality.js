// Render quality: 'high' (full detail) or 'low' (performance). The visitor's choice is
// 'auto' | 'high' | 'low'; auto picks from the device and is lowered at runtime if frames are slow.
const KEY = 'ba-quality';

export function storedQuality() {
  try { const q = localStorage.getItem(KEY); return q === 'high' || q === 'low' ? q : 'auto'; } catch { return 'auto'; }
}
export function saveQuality(q) {
  try { localStorage.setItem(KEY, q); } catch { /* storage unavailable */ }
}

// Conservative guess: phones/tablets, low-memory devices and integrated or mobile GPUs start in performance mode.
export function detectQuality(renderer) {
  let gpu = '';
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
  } catch { /* not available */ }
  const touch = matchMedia('(pointer: coarse)').matches || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  const lowMemory = typeof navigator.deviceMemory === 'number' && navigator.deviceMemory <= 4;
  const fewCores = typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency <= 4;
  const weakGpu = /Intel\(R\) (HD|UHD|Iris\(TM\) Graphics [0-9]{3}\b)|Mali|Adreno|PowerVR|SwiftShader|llvmpipe|Software|Microsoft Basic/i.test(gpu);
  return touch || lowMemory || weakGpu || (fewCores && !/NVIDIA|Radeon RX|Apple M/i.test(gpu)) ? 'low' : 'high';
}

export function resolveQuality(pref, renderer) {
  return pref === 'auto' ? detectQuality(renderer) : pref;
}
