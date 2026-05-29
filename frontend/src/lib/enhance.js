/**
 * Vision Up — 高画質化 API クライアント。
 * SSE (Server-Sent Events) を fetch + ReadableStream で読み出し、
 * 進捗・部分結果を逐次コールバックする。
 */

export const SCALE_OPTIONS = [
  {
    value: '1.5',
    label: '1.5倍',
    summary: '非推奨',
    description: '極めてスペックの低い端末でのみ使用を推奨。',
    tone: 'muted',
  },
  {
    value: '2',
    label: '2倍',
    summary: '超軽量重視',
    description: 'あまりお勧めはしませんが、とにかく素早く処理を終わらせたい場合に有効。',
    tone: 'muted',
  },
  {
    value: '4',
    label: '4倍',
    summary: '軽量・画質バランス',
    description: '軽量さと高画質のバランスが取れています。ただし、画質面では若干の懸念あり。',
    tone: 'neutral',
  },
  {
    value: '6',
    label: '6倍',
    summary: '推奨・標準設定',
    description: '高画質で非常に優秀。軽量面では若干劣りますが、ほとんどの場合は気にならない水準。',
    tone: 'recommended',
    recommended: true,
  },
  {
    value: '8',
    label: '8倍',
    summary: '最大倍率',
    description: '著しく画質が低い画像を超高画質に仕上げたい場合にお勧め。軽量面では懸念あり。',
    tone: 'neutral',
  },
];

export const DEFAULT_SCALE = '6';

export const MAX_TOTAL_BYTES = 50 * 1024 * 1024;

export const ACCEPT =
  '.jpg,.jpeg,.png,.webp,.svg,.bmp,.gif,.tif,.tiff,.avif,image/*';

export function isAcceptedFile(file) {
  const okMime = /^image\//.test(file.type || '');
  const okExt = /\.(jpe?g|png|webp|svg|bmp|gif|tiff?|avif|heic|heif)$/i.test(file.name || '');
  return okMime || okExt;
}

export function formatBytes(n) {
  if (!Number.isFinite(n)) return '-';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${u[i]}`;
}

/**
 * SSE ストリームで高画質化を実行。
 * @param {{files: File[], scale: string, format: 'jpeg'|'png', signal?: AbortSignal,
 *          onStart?: ({total}) => void,
 *          onProgress?: (status) => void,
 *          onFile?: ({index, result}) => void,
 *          onFileError?: ({index, filename, error, message}) => void,
 *          onDone?: ({ok, processed, total}) => void,
 *        }} opts
 */
export async function enhanceStream(opts) {
  const { files, scale, format, signal } = opts;
  const fd = new FormData();
  files.forEach((f) => fd.append('images', f, f.name));
  fd.append('scale', scale);
  fd.append('format', format);

  const res = await fetch('/api/enhance-stream', {
    method: 'POST',
    body: fd,
    signal,
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    let msg = `エラー (HTTP ${res.status})`;
    try {
      const j = JSON.parse(text);
      if (j.error) msg = j.error;
    } catch {}
    throw new Error(msg);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  const dispatch = (eventName, data) => {
    let payload;
    try {
      payload = JSON.parse(data);
    } catch {
      return;
    }
    if (eventName === 'start') opts.onStart?.(payload);
    else if (eventName === 'progress') opts.onProgress?.(payload);
    else if (eventName === 'file') opts.onFile?.(payload);
    else if (eventName === 'error') opts.onFileError?.(payload);
    else if (eventName === 'done') opts.onDone?.(payload);
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE: メッセージは \n\n で区切られる。
    let idx;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const lines = raw.split('\n');
      let event = 'message';
      let data = '';
      for (const line of lines) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      if (data) dispatch(event, data);
    }
  }
}

/**
 * Base64 → Blob 変換。
 */
export function base64ToBlob(b64, mime) {
  const bin = atob(b64);
  const len = bin.length;
  const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

/**
 * クライアントサイドでフォーマット変換 (JPEG / PNG)。
 */
export async function reencode(blob, asFormat) {
  const srcUrl = URL.createObjectURL(blob);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = srcUrl;
    });
    const cnv = document.createElement('canvas');
    cnv.width = img.naturalWidth;
    cnv.height = img.naturalHeight;
    const ctx = cnv.getContext('2d');
    if (asFormat === 'jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, cnv.width, cnv.height);
    }
    ctx.drawImage(img, 0, 0);
    return await new Promise((res) =>
      cnv.toBlob(res, asFormat === 'jpeg' ? 'image/jpeg' : 'image/png', 0.95)
    );
  } finally {
    URL.revokeObjectURL(srcUrl);
  }
}
