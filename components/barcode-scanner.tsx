"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Keyboard, Flashlight, ChevronDown, ChevronUp } from "lucide-react";

interface BarcodeScannerProps {
  onDetected: (code: string) => void;
  onClose: () => void;
}

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"] as const;
const SCAN_INTERVAL_MS = 250;
const MAX_DETECT_ERRORS = 8; // ~2 s of consecutive detect() failures

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
  // Awaited so a wasm that cannot load rejects here (-> visible error) instead
  // of failing every detect() call silently.
  await prepareZXingModule({
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
  const [manualOpen, setManualOpen] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Escape closes the scanner. Registered on window (capture) so it runs before
  // the parent Modal's document-level handler and does not close the form too.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
      } else if (e.key === "Tab") {
        e.stopPropagation(); // keep the parent modal's focus trap out of the way
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  async function toggleTorch() {
    const track = trackRef.current;
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet],
      });
      setTorchOn(next);
    } catch {
      setTorchAvailable(false);
    }
  }

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
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
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
      const track = stream.getVideoTracks()[0];
      trackRef.current = track ?? null;
      const caps = track?.getCapabilities?.() as { torch?: boolean } | undefined;
      if (caps?.torch) setTorchAvailable(true);
      const modes = (caps as { focusMode?: string[] } | undefined)?.focusMode;
      if (modes?.includes("continuous")) {
        try {
          await track.applyConstraints({
            advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet],
          });
        } catch {
          // autofocus stays at the device default
        }
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

      let detectErrors = 0;
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
          detectErrors = 0;
        } catch {
          // a few transient errors are fine; a run of them means the scanner is broken
          if (++detectErrors >= MAX_DETECT_ERRORS) {
            if (!cancelled) {
              setError("Could not load the barcode scanner. Enter the barcode manually.");
            }
            stop();
            return;
          }
        }
        if (!cancelled) timer = setTimeout(tick, SCAN_INTERVAL_MS);
      };
      tick();
    }

    start();
    return stop;
  }, []);

  const showManual = manualOpen || !!error;
  const manualValid = /^\d{8,14}$/.test(manual);

  function submitManual(e: React.FormEvent) {
    e.preventDefault();
    if (manualValid) onDetected(manual);
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Scan barcode"
      className="fixed inset-0 bg-black z-[55] flex flex-col"
    >
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <h2 className="font-semibold">Scan barcode</h2>
        <div className="flex items-center gap-1">
          {torchAvailable && (
            <button
              type="button"
              onClick={toggleTorch}
              aria-pressed={torchOn}
              aria-label="Toggle torch"
              className={`p-2 rounded-lg hover:bg-white/10 ${torchOn ? "bg-white/20" : ""}`}
            >
              <Flashlight className="w-5 h-5" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close scanner"
            className="p-2 rounded-lg hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
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

      <div className="bg-white p-3 max-h-[50dvh] overflow-y-auto overscroll-contain">
        <button
          type="button"
          onClick={() => setManualOpen((o) => !o)}
          aria-expanded={showManual}
          className="w-full flex items-center justify-between gap-1.5 px-1 py-1 text-sm font-medium text-gray-700"
        >
          <span className="flex items-center gap-1.5">
            <Keyboard className="w-4 h-4" />
            Enter the barcode manually
          </span>
          {showManual ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
        {showManual && (
          <form onSubmit={submitManual} className="mt-2 space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                maxLength={14}
                value={manual}
                onChange={(e) => setManual(e.target.value.replace(/\D/g, ""))}
                placeholder="e.g. 5449000000996"
                aria-label="Barcode number"
                autoFocus
                className="flex-1 min-w-0 px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-base md:text-sm"
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
        )}
      </div>
    </div>,
    document.body
  );
}
