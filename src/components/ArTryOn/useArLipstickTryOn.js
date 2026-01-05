import { useEffect, useRef, useState } from "react";
import * as tf from "@tensorflow/tfjs";
import * as faceLandmarksDetection from "@tensorflow-models/face-landmarks-detection";
import { LIP_INNER, LIP_OUTER } from "./constants";
import {
  buildSmoothedDisplayLandmarks,
  computeCoverTransform,
  drawLipstick,
  getPointsForIndices,
  toPoints,
} from "./arUtils";

const useArLipstickTryOn = ({ isMobile, lipstickColorRef, lipstickOpacityRef }) => {
  const wrapperRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const modelRef = useRef(null);
  const previousDisplayLandmarksRef = useRef(null);
  const displaySizeRef = useRef({ width: 640, height: 300 });
  const displayOffsetRef = useRef({ left: 0, top: 0 });
  const canvasSizeRef = useRef({ width: 0, height: 0 });

  const [cameraReady, setCameraReady] = useState(false);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [error, setError] = useState(null);
  const [modelRuntime, setModelRuntime] = useState("loading...");

  const isLoading = !cameraReady || !isModelLoaded;

  useEffect(() => {
    const updateDisplaySize = () => {
      const wrapper = wrapperRef.current;
      if (!wrapper) return;
      const rect = wrapper.getBoundingClientRect();
      const style = window.getComputedStyle(wrapper);
      const paddingLeft = parseFloat(style.paddingLeft) || 0;
      const paddingRight = parseFloat(style.paddingRight) || 0;
      const paddingTop = parseFloat(style.paddingTop) || 0;
      const paddingBottom = parseFloat(style.paddingBottom) || 0;
      const width = Math.max(0, rect.width - paddingLeft - paddingRight);
      const height = Math.max(0, rect.height - paddingTop - paddingBottom);

      displaySizeRef.current = {
        width: Math.round(width),
        height: Math.round(height),
      };
      displayOffsetRef.current = {
        left: paddingLeft,
        top: paddingTop,
      };
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

        console.log("TF backend: ", tf.getBackend());

        let detector;
        let runtimeUsed = "tfjs";

        try {
          console.log("Attempting to load MediaPipe runtime...");
          detector = await faceLandmarksDetection.createDetector(
            faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
            {
              runtime: "mediapipe",
              solutionPath: "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh",
              refineLandmarks: true,
              maxFaces: 1,
              minDetectionConfidence: 0.35,
              minTrackingConfidence: 0.35,
            }
          );
          runtimeUsed = "mediapipe";
          console.log("MediaPipe runtime loaded successfully");
        } catch (mediapipeError) {
          console.warn(
            "MediaPipe runtime failed, falling back to TF.js:",
            mediapipeError
          );

          detector = await faceLandmarksDetection.createDetector(
            faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
            {
              runtime: "tfjs",
              refineLandmarks: true,
              maxFaces: 1,
              minDetectionConfidence: 0.35,
              minTrackingConfidence: 0.35,
            }
          );
          runtimeUsed = "tfjs";
          console.log("TF.js runtime loaded successfully");
        }

        if (videoRef.current) {
          try {
            const warmupFaces = await detector.estimateFaces(
              videoRef.current,
              {
                flipHorizontal: false,
              }
            );
            console.log(
              "Warmup successful, faces detected:",
              warmupFaces?.length ?? 0
            );
          } catch (warmupError) {
            console.warn("Warmup detection failed:", warmupError);
          }
        }

        if (isMounted) {
          modelRef.current = detector;
          setIsModelLoaded(true);
          setModelRuntime(runtimeUsed);
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
        const containerOffset = displayOffsetRef.current;

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
        canvas.style.left = `${containerOffset.left}px`;
        canvas.style.top = `${containerOffset.top}px`;

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
        } catch (detectionError) {
          console.error("Detection error:", detectionError);
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
  }, [isMobile, lipstickColorRef, lipstickOpacityRef]);

  return {
    wrapperRef,
    videoRef,
    canvasRef,
    cameraReady,
    isModelLoaded,
    faceDetected,
    modelRuntime,
    error,
    isLoading,
  };
};

export default useArLipstickTryOn;
