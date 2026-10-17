// Copies the zxing-wasm reader binary into /public so the barcode scanner
// self-hosts it (no CDN). Runs on postinstall; safe to re-run manually.
import { copyFileSync, mkdirSync, existsSync } from "node:fs";

const src = "node_modules/zxing-wasm/dist/reader/zxing_reader.wasm";
const destDir = "public/zxing";

if (!existsSync(src)) {
  console.warn(`[copy-zxing-wasm] ${src} not found, skipping`);
} else {
  mkdirSync(destDir, { recursive: true });
  copyFileSync(src, `${destDir}/zxing_reader.wasm`);
  console.log("[copy-zxing-wasm] copied zxing_reader.wasm to public/zxing/");
}
