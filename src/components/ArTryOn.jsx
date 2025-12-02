import React, { useEffect, useRef, useState } from "react";
import * as tf from "@tensorflow/tfjs-core";
import "@tensorflow/tfjs-backend-webgl";
import "@tensorflow/tfjs-backend-cpu";
import "@tensorflow/tfjs-converter";
import * as faceLandmarksDetection from "@tensorflow-models/face-landmarks-detection";
import { FaceMesh } from "@mediapipe/face_mesh";


const LIP_OUTER = [
  61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84,
  181, 91, 146,
];
const LIP_INNER = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308];

const PRESET_LIPSTICKS = [
  { id: 1, name: "Crimson Red", hex: "#d21b46" },
  { id: 2, name: "Nude Peach", hex: "#e8a38a" },
  { id: 3, name: "Coral Pink", hex: "#ff6b81" },
  { id: 4, name: "Deep Plum", hex: "#5a1033" },
];

const ArTryOn = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const modelRef = useRef(null);
  const runtimeRef = useRef("mediapipe");
  const eyelashImgRef = useRef(null);
  const lipstickColorRef = useRef("#d21b46");
  const lipstickOpacityRef = useRef(0.6);
  const eyelashesEnabledRef = useRef(false);

  const [lipstickColor, setLipstickColor] = useState("#d21b46");
  const [lipstickOpacity, setLipstickOpacity] = useState(0.6);
  const [selectedShade, setSelectedShade] = useState(PRESET_LIPSTICKS[0].id);
  const [eyelashesEnabled, setEyelashesEnabled] = useState(false);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [error, setError] = useState(null);
  const [snapshotDataUrl, setSnapshotDataUrl] = useState(null);
  const [processedDataUrl, setProcessedDataUrl] = useState(null);
  const [faceDetected, setFaceDetected] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const img = new Image();
    img.src = "/overlays/eyelashes.png";
    img.onload = () => {
      eyelashImgRef.current = img;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const setupCamera = async () => {
      const video = videoRef.current;
      if (!video) return;

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: false,
        });

        video.srcObject = stream;
        await new Promise((resolve) => {
          video.onloadedmetadata = () => {
            video.play();
            resolve();
          };
        });

        const { videoWidth, videoHeight } = video;
        video.width = videoWidth;
        video.height = videoHeight;

        const canvas = canvasRef.current;
        if (canvas) {
          canvas.width = videoWidth;
          canvas.height = videoHeight;
        }

        if (isMounted) {
          setCameraReady(true);
        }
      } catch (err) {
        console.error("Camera error:", err);
        if (isMounted) {
          setError(
            "Unable to access camera. Please allow camera permissions to try the demo."
          );
        }
      }
    };

    const loadModel = async () => {
      try {
        try {
          await tf.setBackend("webgl");
          await tf.ready();
        } catch (err) {
          console.warn("WebGL backend failed, falling back to CPU:", err);
          await tf.setBackend("cpu");
          await tf.ready();
        }

        // Importing FaceMesh ensures mediapipe assets are available; config below uses CDN.
        void FaceMesh;

        let model;
        try {
          model = await faceLandmarksDetection.createDetector(
            faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
            {
              runtime: "mediapipe",
              refineLandmarks: true,
              maxFaces: 1,
              selfieMode: true,
              solutionPath: "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh",
            }
          );
          runtimeRef.current = "mediapipe";
        } catch (mediapipeError) {
          console.warn(
            "Mediapipe runtime failed, trying tfjs runtime:",
            mediapipeError
          );
          model = await faceLandmarksDetection.createDetector(
            faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
            {
              runtime: "tfjs",
              refineLandmarks: true,
              maxFaces: 1,
              selfieMode: true,
            }
          );
          runtimeRef.current = "tfjs";
        }

        if (isMounted) {
          modelRef.current = model;
          setIsModelLoaded(true);
        }
      } catch (err) {
        console.error("Model load error:", err);
        if (isMounted) {
          setError("Failed to load face model. Please refresh and try again.");
        }
      }
    };

    const startDetectionLoop = () => {
      // Live loop removed; we run detection only on capture.
    };

    const bootstrap = async () => {
      await setupCamera();
      await loadModel();
      startDetectionLoop();
    };

    bootstrap();

    return () => {
      isMounted = false;
      const stream = videoRef.current?.srcObject;
      if (stream && stream.getTracks) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    lipstickColorRef.current = lipstickColor;
    lipstickOpacityRef.current = lipstickOpacity;
    eyelashesEnabledRef.current = eyelashesEnabled;
  }, [lipstickColor, lipstickOpacity, eyelashesEnabled]);

  const handleShadeChange = (event) => {
    const shadeId = Number(event.target.value);
    setSelectedShade(shadeId);
    const shade = PRESET_LIPSTICKS.find((s) => s.id === shadeId);
    if (shade) {
      setLipstickColor(shade.hex);
    }
  };

  const handleSnapshot = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const model = modelRef.current;
    if (!video || !canvas || !model) return;

    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, width, height);
    const raw = canvas.toDataURL("image/png");
    setSnapshotDataUrl(raw);

    setIsProcessing(true);
    setFaceDetected(false);

    try {
      const predictions = await model.estimateFaces(canvas, {
        flipHorizontal: runtimeRef.current === "tfjs",
        staticImageMode: true,
      });

      if (predictions && predictions.length > 0) {
        const pts = toPoints(predictions[0]);
        if (pts) {
          setFaceDetected(true);
          ctx.drawImage(video, 0, 0, width, height);
          drawLipstick(
            ctx,
            pts,
            width,
            height,
            lipstickColorRef.current,
            lipstickOpacityRef.current
          );
          if (eyelashesEnabledRef.current) {
            drawEyelashes(ctx, pts, eyelashImgRef.current);
          }
        }
      } else {
        setFaceDetected(false);
      }

      const processed = canvas.toDataURL("image/png");
      setProcessedDataUrl(processed);
    } catch (err) {
      console.error("Snapshot prediction error:", err);
      setError(
        "Failed to detect face on snapshot. Try better lighting and look at the camera."
      );
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <section className="ar-card">
      <div className="status-bar">
        <span className={`status-dot ${cameraReady ? "ok" : ""}`} />
        <span>{cameraReady ? "Camera ready" : "Waiting for camera..."}</span>
        <span>•</span>
        <span className={`status-dot ${isModelLoaded ? "ok" : ""}`} />
        <span>
          {isModelLoaded ? "Face model ready" : "Loading face model..."}
        </span>
        <span>•</span>
        <span className={`status-dot ${faceDetected ? "ok" : ""}`} />
        <span>{faceDetected ? "Face detected" : "No face detected"}</span>
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="view-area">
        <video ref={videoRef} autoPlay playsInline muted />
        <canvas ref={canvasRef} />
      </div>

      <div className="controls">
        <div className="control-row">
          <label htmlFor="shade">Preset lipstick shades</label>
          <select id="shade" value={selectedShade} onChange={handleShadeChange}>
            {PRESET_LIPSTICKS.map((shade) => (
              <option key={shade.id} value={shade.id}>
                {shade.name} ({shade.hex})
              </option>
            ))}
          </select>
        </div>

        <div className="control-row">
          <label htmlFor="color">Custom lipstick color</label>
          <input
            id="color"
            type="color"
            value={lipstickColor}
            onChange={(e) => setLipstickColor(e.target.value)}
          />
        </div>

        <div className="control-row wide">
          <label htmlFor="opacity">
            Lipstick opacity: {(lipstickOpacity * 100).toFixed(0)}%
          </label>
          <input
            id="opacity"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={lipstickOpacity}
            onChange={(e) => setLipstickOpacity(Number(e.target.value))}
          />
        </div>

        <div className="toggle-row">
          <input
            id="eyelashes"
            type="checkbox"
            checked={eyelashesEnabled}
            onChange={(e) => setEyelashesEnabled(e.target.checked)}
          />
          <label htmlFor="eyelashes">Enable eyelashes overlay</label>
        </div>

        <button
          className="btn wide"
          type="button"
          onClick={handleSnapshot}
          disabled={isProcessing || !isModelLoaded}
        >
          {isProcessing ? "Processing..." : "Capture & Apply"}
        </button>

        <div className="snapshot wide">
          <label>Snapshot vs. Try-on</label>
          <div className="snapshot-pair">
            <div>
              <div className="thumb-label">Original</div>
              {snapshotDataUrl ? (
                <img src={snapshotDataUrl} alt="Original snapshot" />
              ) : (
                <span style={{ color: "#7f8491", fontSize: "14px" }}>
                  Capture a frame to see it here.
                </span>
              )}
            </div>
            <div>
              <div className="thumb-label">With lipstick/eyelashes</div>
              {processedDataUrl ? (
                <img src={processedDataUrl} alt="Processed snapshot" />
              ) : (
                <span style={{ color: "#7f8491", fontSize: "14px" }}>
                  After capture, the processed image appears here.
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

function drawLipstick(ctx, landmarks, width, height, color, opacity) {
  if (!landmarks || !ctx) return;

  const outlineWidth = Math.max(1, Math.min(width, height) * 0.0025);

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = color;

  // Combined path with even-odd rule for cleaner fill
  ctx.beginPath();
  LIP_OUTER.forEach((index, idx) => {
    const [x, y] = landmarks[index];
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  LIP_INNER.forEach((index, idx) => {
    const [x, y] = landmarks[index];
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fill("evenodd");

  // Soft blend edge
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "blur(1.5px)";
  ctx.strokeStyle = color;
  ctx.lineWidth = outlineWidth * 2;
  ctx.beginPath();
  LIP_OUTER.forEach((index, idx) => {
    const [x, y] = landmarks[index];
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.stroke();

  // Crisp outline for definition
  ctx.filter = "none";
  ctx.lineWidth = outlineWidth;
  ctx.strokeStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  LIP_OUTER.forEach((index, idx) => {
    const [x, y] = landmarks[index];
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.stroke();

  ctx.restore();
}

function drawSingleEyeEyelash(ctx, img, p1, p2) {
  if (!img || !img.complete) return;
  const [x1, y1] = p1;
  const [x2, y2] = p2;

  const centerX = (x1 + x2) / 2;
  const centerY = (y1 + y2) / 2;
  const eyeWidth = Math.hypot(x2 - x1, y2 - y1) * 2.2;
  const eyeHeight = eyeWidth * 0.45;
  const angle = Math.atan2(y2 - y1, x2 - x1);

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(angle);
  ctx.drawImage(img, -eyeWidth / 2, -eyeHeight / 2, eyeWidth, eyeHeight);
  ctx.restore();
}

function drawEyelashes(ctx, landmarks, img) {
  if (!landmarks || !img || !ctx) return;
  const leftOuter = landmarks[33];
  const leftInner = landmarks[133];
  const rightOuter = landmarks[362];
  const rightInner = landmarks[263];

  drawSingleEyeEyelash(ctx, img, leftOuter, leftInner);
  drawSingleEyeEyelash(ctx, img, rightInner, rightOuter);
}

function drawDebugLandmarks(ctx, landmarks) {
  ctx.save();
  ctx.fillStyle = "rgba(255, 255, 0, 0.6)";
  landmarks.forEach(([x, y], idx) => {
    const r = idx % 10 === 0 ? 3.5 : 2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

function toPoints(prediction) {
  if (!prediction) return null;
  // For tfjs runtime we get scaledMesh; for mediapipe runtime we get keypoints
  if (prediction.scaledMesh) return prediction.scaledMesh;
  if (prediction.keypoints) {
    return prediction.keypoints.map((kp) => [kp.x, kp.y, kp.z ?? 0]);
  }
  return null;
}

export default ArTryOn;
