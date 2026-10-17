"use client";

import { useEffect, useRef, useState } from "react";
import { X, Keyboard } from "lucide-react";

interface BarcodeScannerProps {
  onDetected: (code: string) => void;
  onClose: () => void;
}

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"] as const;
const SCAN_INTERVAL_MS = 250;

interface DetectorLike {
  detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]>;
}

type NativeDetectorCtor = {
  new (opts: { formats: string[] }): DetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
};

// Uses the native BarcodeDetector when it supports our formats (Android Chrome),
// otherwise the zxing-wasm ponyfill with the wasm self-hosted from /public/zxing.
async function createDetector(): Promise<DetectorLike> {
  const Native = (window as unknown as { BarcodeDetector?: NativeDetectorCtor })
    .BarcodeDetector;

  if (Native) {
    try {
      const supported = (await Native.getSupportedFormats?.()) ?? [];
      if (FORMATS.every((f) => supported.includes(f))) {
        return new Native({ formats: [...FORMATS] });
      }
    } catch {
      // fall through to the ponyfill
    }
  }

  const { BarcodeDetector, prepareZXingModule } = await import(
    "barcode-detector/ponyfill"
  );
  prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) =>
        path.endsWith(".wasm") ? `/zxing/${path}` : prefix + path,
    },
    fireImmediately: true,
  });
  return new BarcodeDetector({ formats: [...FORMATS] });
}

export default function BarcodeScanner({ onDetected, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onDetectedRef = useRef(onDetected);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(true);
  const [manual, setManual] = useState("");

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function stop() {
      cancelled = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
    }

    async function start() {
      if (!window.isSecureContext) {
        setError(
          "Camera access requires a secure (HTTPS) connection. Open the app over HTTPS, or enter the barcode manually."
        );
        setStarting(false);
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("This browser does not support camera access. Enter the barcode manually.");
        setStarting(false);
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
      } catch (err) {
        const name = err instanceof DOMException ? err.name : "";
        if (name === "NotAllowedError") {
          setError(
            "Camera permission was denied. Allow camera access in your browser settings, or enter the barcode manually."
          );
        } else if (name === "NotFoundError") {
          setError("No camera was found on this device. Enter the barcode manually.");
        } else {
          setError("Could not start the camera. Enter the barcode manually.");
        }
        setStarting(false);
        return;
      }

      if (cancelled) {
        stop();
        return;
      }

      const video = videoRef.current;
      if (!video) {
        stop();
        return;
      }
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        // autoplay attributes handle playback; ignore
      }

      let detector: DetectorLike;
      try {
        detector = await createDetector();
      } catch {
        if (!cancelled) {
          setError("Could not load the barcode scanner. Enter the barcode manually.");
          setStarting(false);
        }
        stop();
        return;
      }
      if (cancelled) return;
      setStarting(false);

      const tick = async () => {
        if (cancelled) return;
        try {
          if (video.readyState >= 2) {
            const codes = await detector.detect(video);
            const hit = codes.find((c) => /^\d{8,14}$/.test(c.rawValue));
            if (hit && !cancelled) {
              navigator.vibrate?.(50);
              stop();
              onDetectedRef.current(hit.rawValue);
              return;
            }
          }
        } catch {
          // transient detect errors: keep scanning
        }
        if (!cancelled) timer = setTimeout(tick, SCAN_INTERVAL_MS);
      };
      tick();
    }

    start();
    return stop;
  }, []);

  const manualValid = /^\d{8,14}$/.test(manual);

  function submitManual(e: React.FormEvent) {
    e.preventDefault();
    if (manualValid) onDetected(manual);
  }

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <h2 className="font-semibold">Scan barcode</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close scanner"
          className="p-2 rounded-lg hover:bg-white/10"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="relative flex-1 min-h-0 overflow-hidden">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="absolute inset-0 w-full h-full object-cover"
        />
        {!error && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-72 max-w-[85%] h-40 border-2 border-emerald-400 rounded-xl shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]" />
          </div>
        )}
        {!error && (
          <p className="absolute inset-x-0 bottom-4 text-center text-sm text-white/80">
            {starting ? "Starting camera..." : "Point the camera at a barcode"}
          </p>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <p className="text-center text-sm text-white bg-red-600/80 rounded-lg px-4 py-3 max-w-sm">
              {error}
            </p>
          </div>
        )}
      </div>

      <form onSubmit={submitManual} className="bg-white p-4 space-y-2">
        <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
          <Keyboard className="w-4 h-4" />
          Or enter the barcode manually
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            inputMode="numeric"
            maxLength={14}
            value={manual}
            onChange={(e) => setManual(e.target.value.replace(/\D/g, ""))}
            placeholder="e.g. 5449000000996"
            className="flex-1 min-w-0 px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm"
          />
          <button
            type="submit"
            disabled={!manualValid}
            className="px-4 py-2 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 text-sm"
          >
            Look up
          </button>
        </div>
        <p className="text-xs text-gray-500">8 to 14 digits</p>
      </form>
    </div>
  );
}
