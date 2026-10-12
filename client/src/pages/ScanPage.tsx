import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import jsQR from "jsqr";
import type { ConsentPoll } from "../api";
import { api } from "../api";
import { ProfileCard } from "../components/ProfileCard";
import { descriptorFromVideoFrame } from "../lib/face";

type Phase = "camera" | "waiting" | "done";

export function ScanPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>("camera");
  const [consentId, setConsentId] = useState<string | null>(null);
  const [poll, setPoll] = useState<ConsentPoll | null>(null);
  const [message, setMessage] = useState("");
  const scanningRef = useRef(false);
  const lastFaceScanRef = useRef(0);

  useEffect(() => {
    let stream: MediaStream | null = null;
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch {
        setMessage("Camera permission denied. Enable it in settings to scan.");
      }
    })();
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);

  useEffect(() => {
    if (phase !== "camera") return;
    const id = window.setInterval(() => void detectOnce(), 400);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase !== "waiting" || !consentId) return;
    const id = window.setInterval(async () => {
      try {
        const data = await api.pollConsent(consentId);
        setPoll(data);
        if (data.status !== "pending") setPhase("done");
      } catch {
        /* ignore */
      }
    }, 1000);
    return () => clearInterval(id);
  }, [phase, consentId]);

  async function startConsentFromQr(token: string) {
    if (scanningRef.current) return;
    scanningRef.current = true;
    try {
      const { consent } = await api.scanQr(token);
      setConsentId(consent.id);
      setPoll(consent);
      setPhase("waiting");
      setMessage("");
    } catch (err: unknown) {
      const e = err as { data?: { message?: string }; message?: string };
      setMessage(e.data?.message ?? e.message ?? "Scan failed");
      scanningRef.current = false;
    }
  }

  async function startConsentFromFace(descriptor: number[]) {
    if (scanningRef.current) return;
    scanningRef.current = true;
    try {
      const { consent } = await api.scanFace(descriptor);
      setConsentId(consent.id);
      setPoll(consent);
      setPhase("waiting");
      setMessage("");
    } catch (err: unknown) {
      const e = err as { data?: { message?: string }; message?: string };
      setMessage(e.data?.message ?? e.message ?? "No clear match.");
      scanningRef.current = false;
    }
  }

  async function detectOnce() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return;

    if ("BarcodeDetector" in window) {
      try {
        const detector = new (window as unknown as { BarcodeDetector: new (o: object) => { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> } }).BarcodeDetector({
          formats: ["qr_code"],
        });
        const codes = await detector.detect(video);
        if (codes[0]?.rawValue) {
          await startConsentFromQr(codes[0].rawValue);
          return;
        }
      } catch {
        /* fall through */
      }
    }

    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(video, 0, 0, w, h);
    const imageData = ctx.getImageData(0, 0, w, h);
    const code = jsQR(imageData.data, w, h);
    if (code?.data) {
      await startConsentFromQr(code.data);
      return;
    }

    const now = Date.now();
    if (now - lastFaceScanRef.current < 1200) return;
    lastFaceScanRef.current = now;
    const descriptor = await descriptorFromVideoFrame(video);
    if (descriptor) await startConsentFromFace(descriptor);
  }

  const remainingSec = poll ? Math.ceil(poll.remainingMs / 1000) : 0;

  return (
    <div className="app-shell">
      <Link to="/" className="muted">← Home</Link>
      <h1>Scan</h1>
      {phase === "camera" && (
        <>
          <video ref={videoRef} className="scan-video" playsInline muted />
          <canvas ref={canvasRef} hidden />
          {message && <p style={{ color: "var(--danger)" }}>{message}</p>}
          <p className="muted">Point at a portrait QR or a enrolled face.</p>
        </>
      )}
      {phase === "waiting" && (
        <div className="card">
          <p>Waiting for approval…</p>
          <p className="muted">{remainingSec}s left</p>
        </div>
      )}
      {phase === "done" && poll && (
        <>
          {poll.status === "accepted" && poll.profile && (
            <ProfileCard
              displayName={poll.profile.displayName}
              avatarUrl={poll.profile.avatarUrl}
              bannerUrl={poll.profile.bannerUrl}
              links={poll.profile.links}
            />
          )}
          {poll.status === "rejected" && <p>Request denied.</p>}
          {poll.status === "expired" && <p>No answer.</p>}
          <button
            type="button"
            className="btn-secondary"
            style={{ marginTop: "1rem", width: "100%" }}
            onClick={() => {
              setPhase("camera");
              setPoll(null);
              setConsentId(null);
              scanningRef.current = false;
            }}
          >
            Scan again
          </button>
        </>
      )}
    </div>
  );
}
