// Browser-only: slice tall screenshots into <=1560px JPEG chunks (with overlap) so the
// model can read them. Shared by the receipt import and the recipe import.

export const MAX_TOTAL_BYTES = 4 * 1024 * 1024;
export const CHUNK_H = 1560;
export const OVERLAP = 120;
export const MAX_W = 1600;
/** Server limit on the number of uploaded parts (both parse routes). */
export const MAX_PARTS = 10;

export type Prepared = { name: string; blob: Blob };

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/jpeg", 0.85),
  );
}

/** Slice tall images into <=1560px JPEG chunks with overlap; PDFs and small images pass through. */
export async function prepareFile(file: File): Promise<Prepared[]> {
  if (file.type === "application/pdf") return [{ name: file.name, blob: file }];
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, MAX_W / bmp.width);
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const passthrough =
    scale === 1 &&
    h <= CHUNK_H &&
    file.size < 1.5 * 1024 * 1024 &&
    ["image/jpeg", "image/png", "image/webp"].includes(file.type);
  if (passthrough) {
    bmp.close();
    return [{ name: file.name, blob: file }];
  }
  const out: Prepared[] = [];
  const step = CHUNK_H - OVERLAP;
  let y = 0;
  let i = 1;
  while (y < h) {
    const ch = Math.min(CHUNK_H, h - y);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = ch;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, ch);
    ctx.drawImage(bmp, 0, y / scale, bmp.width, ch / scale, 0, 0, w, ch);
    out.push({ name: `${file.name.replace(/\.[^.]+$/, "")}-part${i}.jpg`, blob: await canvasToJpeg(canvas) });
    if (y + ch >= h) break;
    y += step;
    i++;
  }
  bmp.close();
  return out;
}
