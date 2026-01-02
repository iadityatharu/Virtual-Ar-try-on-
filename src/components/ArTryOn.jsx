import React, { useEffect, useRef, useState } from "react";
import * as tf from "@tensorflow/tfjs-core";
import "@tensorflow/tfjs-backend-webgl";
import "@tensorflow/tfjs-backend-cpu";
import "@tensorflow/tfjs-converter";
import * as faceLandmarksDetection from "@tensorflow-models/face-landmarks-detection";
import { FaceMesh } from "@mediapipe/face_mesh";
import { FaCamera } from "react-icons/fa6";

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
  const snapshotCanvasRef = useRef(null);
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
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const img = new Image();
    img.src = "/overlays/eyelashes.png";
    img.onload = () => {
      eyelashImgRef.current = img;
    };
  }, []);

  // Handle window resize for responsive design
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
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
            width: { ideal: isMobile ? 480 : 640 },
            height: { ideal: isMobile ? 360 : 480 },
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
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const model = modelRef.current;

      if (!video || !canvas || !model) return;

      const ctx = canvas.getContext("2d");
      let animationId;

      const detect = async () => {
        if (!videoRef.current || !canvasRef.current || !modelRef.current) {
          return;
        }

        try {
          const predictions = await modelRef.current.estimateFaces(video, {
            flipHorizontal: false,
          });

          const { videoWidth, videoHeight } = video;
          canvas.width = videoWidth;
          canvas.height = videoHeight;

          ctx.clearRect(0, 0, videoWidth, videoHeight);

          if (predictions && predictions.length > 0) {
            setFaceDetected(true);
            const keypoints = predictions[0].keypoints;
            const landmarks = keypoints.map((kp) => [kp.x, kp.y, kp.z || 0]);

            const flippedPts = landmarks.map(([x, y, z]) => [
              videoWidth - x,
              y,
              z,
            ]);

            drawLipstick(
              ctx,
              flippedPts,
              videoWidth,
              videoHeight,
              lipstickColorRef.current,
              lipstickOpacityRef.current
            );

            // Draw eyelashes
            if (eyelashesEnabledRef.current && eyelashImgRef.current) {
              drawEyelashes(
                ctx,
                flippedPts,
                videoWidth,
                videoHeight,
                eyelashImgRef.current
              );
            }
          } else {
            setFaceDetected(false);
          }
        } catch (err) {
          console.error("Detection error:", err);
        }

        animationId = requestAnimationFrame(detect);
      };

      detect();

      return () => {
        if (animationId) {
          cancelAnimationFrame(animationId);
        }
      };
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
    const snapCanvas = snapshotCanvasRef.current;
    const model = modelRef.current;
    if (!video || !snapCanvas || !model) return;

    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;
    snapCanvas.width = width;
    snapCanvas.height = height;

    const ctx = snapCanvas.getContext("2d");
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(video, -width, 0, width, height);
    ctx.restore();
    const raw = snapCanvas.toDataURL("image/png");
    setSnapshotDataUrl(raw);

    setIsProcessing(true);
    setFaceDetected(false);

    try {
      const predictions = await model.estimateFaces(video, {
        flipHorizontal: runtimeRef.current === "tfjs",
        staticImageMode: true,
      });

      if (predictions && predictions.length > 0) {
        const pts = toPoints(predictions[0]);
        if (pts) {
          setFaceDetected(true);
          ctx.clearRect(0, 0, width, height);
          ctx.save();
          ctx.scale(-1, 1);
          ctx.drawImage(video, -width, 0, width, height);
          ctx.restore();
          const flippedPts = pts.map(([x, y, z]) => [width - x, y, z]);
          drawLipstick(
            ctx,
            flippedPts,
            width,
            height,
            lipstickColorRef.current,
            lipstickOpacityRef.current
          );
          if (eyelashesEnabledRef.current) {
            drawEyelashes(ctx, flippedPts, eyelashImgRef.current);
          }
        }
      } else {
        setFaceDetected(false);
      }

      const processed = snapCanvas.toDataURL("image/png");
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
    <div
      style={{
        padding: isMobile ? "12px" : "20px",
        maxWidth: "1200px",
        width: "100%",
      }}
    >
      {error && <div className="error-box">{error}</div>}

      <div
        style={{
          display: "flex",
          gap: isMobile ? "20px" : "30px",
          alignItems: "flex-start",
          flexDirection: isMobile ? "column" : "row",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "20px",
            width: isMobile ? "100%" : "640px",
            maxWidth: "100%",
            flexShrink: 0,
          }}
        >
          <div style={{ position: "relative" }}>
            <div
              className="status-bar"
              style={{
                marginBottom: "12px",
                justifyContent: "flex-start",
                fontSize: isMobile ? "12px" : "14px",
                flexWrap: "wrap",
              }}
            >
              <span className={`status-dot ${cameraReady ? "ok" : ""}`} />
              <span>
                {cameraReady ? "Camera ready" : "Waiting for camera..."}
              </span>
              <span>•</span>
              <span className={`status-dot ${isModelLoaded ? "ok" : ""}`} />
              <span>
                {isModelLoaded ? "Face model ready" : "Loading face model..."}
              </span>
              <span>•</span>
              <span className={`status-dot ${faceDetected ? "ok" : ""}`} />
              <span>{faceDetected ? "Face detected" : "No face detected"}</span>
            </div>

            <div
              style={{
                position: "relative",
                background: "#000",
                borderRadius: "8px",
                overflow: "hidden",
                height: "300px",
              }}
            >
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{
                  transform: "scaleX(-1)",
                  display: "block",
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
              <canvas
                ref={canvasRef}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  pointerEvents: "none",
                }}
              />
              <canvas ref={snapshotCanvasRef} style={{ display: "none" }} />
              <button
                className="btn"
                type="button"
                onClick={handleSnapshot}
                disabled={isProcessing || !isModelLoaded}
                style={{
                  position: "absolute",
                  bottom: isMobile ? "12px" : "20px",
                  left: "50%",
                  transform: "translateX(-50%)",
                  padding: isMobile ? "10px 24px" : "12px 32px",
                  fontSize: isMobile ? "14px" : "16px",
                  fontWeight: "600",
                  zIndex: 10,
                }}
              >
                {isProcessing ? "Processing..." : <FaCamera />}
              </button>
            </div>
          </div>

          {processedDataUrl && (
            <div
              style={{
                position: "relative",
                background: "#000",
                borderRadius: "8px",
                overflow: "hidden",
                height: isMobile ? "auto" : "300px",
                aspectRatio: isMobile ? "4/3" : "auto",
              }}
            >
              <img
                src={processedDataUrl}
                alt="With Try-On Applied"
                style={{ display: "block", width: "100%" }}
              />
              <div
                style={{
                  position: "absolute",
                  top: "10px",
                  left: "10px",
                  background: "rgba(0, 0, 0, 0.7)",
                  color: "#fff",
                  padding: "6px 12px",
                  borderRadius: "4px",
                  fontSize: "14px",
                  fontWeight: "600",
                }}
              >
                With Try-On Applied
              </div>
            </div>
          )}
        </div>

        <div style={{ flex: 1, width: "100%" }}>
          <div style={{ marginBottom: "24px" }}>
            <h2
              style={{
                margin: "0 0 8px 0",
                color: "#f7f7f7",
                fontSize: isMobile ? "20px" : "24px",
                fontWeight: "700",
              }}
            >
              AR Lipstick & Eyelash Try-On Demo
            </h2>
            <p
              style={{
                margin: 0,
                color: "#cfd1d8",
                fontSize: "14px",
                lineHeight: "1.6",
              }}
            >
              Turn on your webcam, pick a lipstick shade, and toggle virtual
              eyelashes. Everything runs fully in the browser.
            </p>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: isMobile ? "16px" : "20px",
            }}
          >
            <div>
              <h3
                style={{
                  margin: "0 0 12px 0",
                  color: "#e2e8f0",
                  fontSize: "16px",
                  fontWeight: "600",
                }}
              >
                Preset Lipstick Shades
              </h3>
              <div
                style={{
                  display: "flex",
                  gap: isMobile ? "10px" : "12px",
                  flexWrap: "wrap",
                }}
              >
                {PRESET_LIPSTICKS.map((shade) => (
                  <div
                    key={shade.id}
                    onClick={() => {
                      setSelectedShade(shade.id);
                      setLipstickColor(shade.hex);
                    }}
                    style={{
                      width: isMobile ? "45px" : "50px",
                      height: isMobile ? "45px" : "50px",
                      borderRadius: "50%",
                      backgroundColor: shade.hex,
                      cursor: "pointer",
                      border:
                        selectedShade === shade.id
                          ? "3px solid #fff"
                          : "3px solid transparent",
                      boxShadow:
                        selectedShade === shade.id
                          ? "0 0 0 2px #ff6b9d, 0 4px 12px rgba(0,0,0,0.3)"
                          : "0 2px 8px rgba(0,0,0,0.2)",
                      transition: "all 0.2s ease",
                    }}
                    title={shade.name}
                    onMouseEnter={(e) => {
                      if (!isMobile && selectedShade !== shade.id) {
                        e.currentTarget.style.transform = "scale(1.1)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isMobile) {
                        e.currentTarget.style.transform = "scale(1)";
                      }
                    }}
                  />
                ))}
              </div>
            </div>

            <div>
              <label
                htmlFor="opacity"
                style={{
                  display: "block",
                  marginBottom: "8px",
                  color: "#cfd1d8",
                  fontSize: "14px",
                }}
              >
                Lipstick Opacity:{" "}
                <span style={{ color: "#ff6b9d", fontWeight: "700" }}>
                  {(lipstickOpacity * 100).toFixed(0)}%
                </span>
              </label>
              <input
                id="opacity"
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={lipstickOpacity}
                style={{ cursor: "pointer", width: "100%" }}
                onChange={(e) => setLipstickOpacity(Number(e.target.value))}
              />
            </div>

            <div>
              <h3
                style={{
                  margin: "0 0 12px 0",
                  color: "#e2e8f0",
                  fontSize: "16px",
                  fontWeight: "600",
                }}
              >
                Additional Effects
              </h3>
              <div className="toggle-row">
                <input
                  id="eyelashes"
                  type="checkbox"
                  checked={eyelashesEnabled}
                  onChange={(e) => setEyelashesEnabled(e.target.checked)}
                />
                <label htmlFor="eyelashes">Enable Eyelashes Overlay</label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
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
