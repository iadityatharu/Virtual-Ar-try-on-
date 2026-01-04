import React, { useEffect, useRef, useState } from "react";
import * as tf from "@tensorflow/tfjs-core";
import "@tensorflow/tfjs-backend-webgl";
import "@tensorflow/tfjs-backend-cpu";
import "@tensorflow/tfjs-converter";
import * as faceLandmarksDetection from "@tensorflow-models/face-landmarks-detection";
import { FaceMesh } from "@mediapipe/face_mesh";

const LIP_OUTER = [
  61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37,
  39, 40, 185,
];
const LIP_INNER = [
  78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82,
  81, 80, 191,
];
const LIP_INDICES = [...LIP_OUTER, ...LIP_INNER];
const PRESET_LIPSTICKS = [{ id: 4, name: "Deep Plum", hex: "#5a1033" }];
const MIRROR_DISPLAY = true;
const LIP_SMOOTHING_ALPHA = 0.45;

const ArTryOn = () => {
  const wrapperRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const modelRef = useRef(null);
  const runtimeRef = useRef("mediapipe");
  const previousDisplayLandmarksRef = useRef(null);
  const displaySizeRef = useRef({ width: 640, height: 300 });
  const canvasSizeRef = useRef({ width: 0, height: 0 });
  const lipstickColorRef = useRef(PRESET_LIPSTICKS[0].hex);
  const lipstickOpacityRef = useRef(0.4);

  const [lipstickColor, setLipstickColor] = useState(PRESET_LIPSTICKS[0].hex);
  const [lipstickOpacity, setLipstickOpacity] = useState(0.4);
  const [selectedShade, setSelectedShade] = useState(PRESET_LIPSTICKS[0].id);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [error, setError] = useState(null);
  const [faceDetected, setFaceDetected] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const isLoading = !cameraReady || !isModelLoaded;

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const updateDisplaySize = () => {
      const rect = wrapperRef.current?.getBoundingClientRect();
      if (rect) {
        displaySizeRef.current = {
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      }
    };

    updateDisplaySize();

    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(updateDisplaySize)
        : null;

    if (observer && wrapperRef.current) {
      observer.observe(wrapperRef.current);
    }

    window.addEventListener("resize", updateDisplaySize);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateDisplaySize);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    let stopLoop = () => {};

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
        } catch (backendError) {
          console.warn(
            "WebGL backend failed, falling back to CPU:",
            backendError
          );
          await tf.setBackend("cpu");
          await tf.ready();
        }

        void FaceMesh;

        let detector;
        try {
          detector = await faceLandmarksDetection.createDetector(
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
            "Mediapipe runtime failed, falling back to tfjs:",
            mediapipeError
          );
          detector = await faceLandmarksDetection.createDetector(
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
          modelRef.current = detector;
          setIsModelLoaded(true);
        }
      } catch (err) {
        console.error("Model load error:", err);
        if (isMounted) {
          setError("Failed to load face model. Please refresh and try again.");
        }
      }
    };

    const resetSmoothing = () => {
      previousDisplayLandmarksRef.current = null;
    };

    const startDetectionLoop = () => {
      let animationId;

      const detect = async () => {
        if (!isMounted) return;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const detector = modelRef.current;

        if (!video || !canvas || !detector) {
          animationId = requestAnimationFrame(detect);
          return;
        }

        const containerWidth = displaySizeRef.current.width;
        const containerHeight = displaySizeRef.current.height;

        if (
          !containerWidth ||
          !containerHeight ||
          !video.videoWidth ||
          !video.videoHeight
        ) {
          animationId = requestAnimationFrame(detect);
          return;
        }

        const transform = computeCoverTransform(
          video,
          containerWidth,
          containerHeight
        );

        if (!transform) {
          animationId = requestAnimationFrame(detect);
          return;
        }

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          animationId = requestAnimationFrame(detect);
          return;
        }

        const dpr = window.devicePixelRatio || 1;
        const requiredWidth = Math.round(containerWidth * dpr);
        const requiredHeight = Math.round(containerHeight * dpr);

        if (
          canvasSizeRef.current.width !== requiredWidth ||
          canvasSizeRef.current.height !== requiredHeight
        ) {
          canvas.width = requiredWidth;
          canvas.height = requiredHeight;
          canvasSizeRef.current = {
            width: requiredWidth,
            height: requiredHeight,
          };
        }

        canvas.style.width = `${containerWidth}px`;
        canvas.style.height = `${containerHeight}px`;

        ctx.save();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, containerWidth, containerHeight);

        try {
          const predictions = await detector.estimateFaces(video, {
            flipHorizontal: false,
          });

          if (predictions && predictions.length > 0) {
            const landmarks = toPoints(predictions[0]);
            if (landmarks) {
              const displayMap = buildSmoothedDisplayLandmarks(
                previousDisplayLandmarksRef,
                landmarks,
                transform,
                containerWidth
              );
              const outer = getPointsForIndices(LIP_OUTER, displayMap);
              const inner = getPointsForIndices(LIP_INNER, displayMap);

              if (outer.length > 2) {
                drawLipstick(
                  ctx,
                  outer,
                  inner,
                  lipstickColorRef.current,
                  lipstickOpacityRef.current
                );
                setFaceDetected(true);
              } else {
                setFaceDetected(false);
                resetSmoothing();
              }
            } else {
              setFaceDetected(false);
              resetSmoothing();
            }
          } else {
            setFaceDetected(false);
            resetSmoothing();
          }
        } catch (err) {
          console.error("Detection error:", err);
        } finally {
          ctx.restore();
          animationId = requestAnimationFrame(detect);
        }
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
      stopLoop = startDetectionLoop();
    };

    bootstrap();

    return () => {
      isMounted = false;
      stopLoop();
      const stream = videoRef.current?.srcObject;
      if (stream?.getTracks) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [isMobile]);

  useEffect(() => {
    lipstickColorRef.current = lipstickColor;
    lipstickOpacityRef.current = lipstickOpacity;
  }, [lipstickColor, lipstickOpacity]);

  const handleShadeClick = (shade) => {
    if (isLoading) return;
    setSelectedShade(shade.id);
    setLipstickColor(shade.hex);
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
              ref={wrapperRef}
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
                  visibility: isLoading ? "hidden" : "visible",
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
                  visibility: isLoading ? "hidden" : "visible",
                }}
              />
              {isLoading && (
                <div className="skeleton-overlay">
                  <div className="skeleton-card">
                    <div className="skeleton-bar short" />
                    <div className="skeleton-bar medium" />
                    <div className="skeleton-bar long" />
                  </div>
                </div>
              )}
            </div>
          </div>
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
              AR Lipstick Try-On
            </h2>
            <p
              style={{
                margin: 0,
                color: "#cfd1d8",
                fontSize: "14px",
                lineHeight: "1.6",
              }}
            >
              Select your shade and opacity, then let the lipstick track your
              live feed.
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
                    onClick={() => handleShadeClick(shade)}
                    style={{
                      width: isMobile ? "45px" : "50px",
                      height: isMobile ? "45px" : "50px",
                      borderRadius: "50%",
                      backgroundColor: shade.hex,
                      cursor: isLoading ? "not-allowed" : "pointer",
                      border:
                        selectedShade === shade.id
                          ? "3px solid #fff"
                          : "3px solid transparent",
                      boxShadow:
                        selectedShade === shade.id
                          ? "0 0 0 2px #ff6b9d, 0 4px 12px rgba(0,0,0,0.3)"
                          : "0 2px 8px rgba(0,0,0,0.2)",
                      transition: "all 0.2s ease",
                      opacity: isLoading ? 0.7 : 1,
                    }}
                    title={shade.name}
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
                style={{
                  width: "100%",
                  cursor: isLoading ? "not-allowed" : "pointer",
                  opacity: isLoading ? 0.7 : 1,
                }}
                disabled={isLoading}
                onChange={(e) => setLipstickOpacity(Number(e.target.value))}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

function drawLipstick(ctx, outerPoints, innerPoints, color, opacity) {
  if (!ctx || !outerPoints || outerPoints.length < 3) return;

  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha = opacity;
  ctx.beginPath();
  drawSmoothClosedPath(ctx, outerPoints);
  if (innerPoints && innerPoints.length > 2) {
    drawSmoothClosedPath(ctx, [...innerPoints].reverse());
  }
  ctx.fill("evenodd");
  // ctx.globalCompositeOperation = "source-over";
  // ctx.filter = "blur(0px)";
  // ctx.strokeStyle = color;
  // ctx.globalAlpha = Math.max(0.1, opacity * 0.8);
  // ctx.lineWidth = 4;
  // ctx.beginPath();
  // drawSmoothClosedPath(ctx, outerPoints);
  // ctx.stroke();
  ctx.restore();
}

function drawSmoothClosedPath(ctx, points) {
  if (!points || points.length < 2) return;

  const len = points.length;
  ctx.moveTo(points[0][0], points[0][1]);

  for (let i = 0; i < len; i += 1) {
    const p0 = points[(i - 1 + len) % len];
    const p1 = points[i];
    const p2 = points[(i + 1) % len];
    const p3 = points[(i + 2) % len];

    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;

    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2[0], p2[1]);
  }

  ctx.closePath();
}

function computeCoverTransform(video, containerWidth, containerHeight) {
  if (!video || !containerWidth || !containerHeight) return null;
  const videoWidth = video.videoWidth;
  const videoHeight = video.videoHeight;
  if (!videoWidth || !videoHeight) return null;

  const scale = Math.max(
    containerWidth / videoWidth,
    containerHeight / videoHeight
  );
  const drawnWidth = videoWidth * scale;
  const drawnHeight = videoHeight * scale;
  const offsetX = (containerWidth - drawnWidth) / 2;
  const offsetY = (containerHeight - drawnHeight) / 2;

  return { offsetX, offsetY, scale };
}

function mapPointToDisplay(point, transform, containerWidth, mirror) {
  if (!point || !transform) return null;
  const x = point[0] * transform.scale + transform.offsetX;
  const y = point[1] * transform.scale + transform.offsetY;
  return mirror ? [containerWidth - x, y] : [x, y];
}

function buildSmoothedDisplayLandmarks(
  prevRef,
  landmarks,
  transform,
  containerWidth
) {
  if (!landmarks || !transform) return null;
  const previous = prevRef.current || {};
  const smoothed = {};

  LIP_INDICES.forEach((index) => {
    const raw = landmarks[index];
    if (!raw) return;
    const mapped = mapPointToDisplay(
      raw,
      transform,
      containerWidth,
      MIRROR_DISPLAY
    );
    if (!mapped) return;
    const prevPoint = previous[index];
    if (prevPoint) {
      smoothed[index] = [
        LIP_SMOOTHING_ALPHA * mapped[0] +
          (1 - LIP_SMOOTHING_ALPHA) * prevPoint[0],
        LIP_SMOOTHING_ALPHA * mapped[1] +
          (1 - LIP_SMOOTHING_ALPHA) * prevPoint[1],
      ];
    } else {
      smoothed[index] = mapped;
    }
  });

  prevRef.current = smoothed;
  return smoothed;
}

function getPointsForIndices(indices, displayMap) {
  if (!displayMap) return [];
  const points = [];
  indices.forEach((idx) => {
    const entry = displayMap[idx];
    if (entry) {
      points.push(entry);
    }
  });
  return points;
}

function toPoints(prediction) {
  if (!prediction) return null;
  if (prediction.scaledMesh) return prediction.scaledMesh;
  if (prediction.keypoints) {
    return prediction.keypoints.map((kp) => [kp.x, kp.y, kp.z ?? 0]);
  }
  return null;
}

export default ArTryOn;
