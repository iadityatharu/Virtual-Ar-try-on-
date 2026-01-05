import React from "react";

const ArTryOnUI = ({
  wrapperRef,
  videoRef,
  canvasRef,
  isMobile,
  error,
  cameraReady,
  isModelLoaded,
  faceDetected,
  modelRuntime,
  isLoading,
  PRESET_LIPSTICKS,
  selectedShade,
  onShadeClick,
  lipstickOpacity,
  onOpacityChange,
}) => {
  const modelPanel = (
    <div
      className="view-area1"
      style={{
        height: "500px",
        width: "350px",
        borderRadius: "8px",
        overflow: "hidden",
        padding: "10px",
        boxSizing: "border-box",
        backgroundImage: "url('/wood.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <img
        src="/model.jpeg"
        alt="Model Reference"
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          borderRadius: "8px",
        }}
      />
    </div>
  );

  return (
    <div
      style={{
        padding: isMobile ? "12px" : "20px",
        maxWidth: "1200px",
        width: "100%",
      }}
    >
      {error && (
        <div
          style={{
            padding: "12px",
            backgroundColor: "rgba(255, 0, 0, 0.1)",
            border: "1px solid rgba(255, 0, 0, 0.3)",
            borderRadius: "8px",
            marginBottom: "16px",
            color: "#ff6b6b",
            fontSize: "14px",
          }}
        >
          {error}
        </div>
      )}

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
              style={{
                marginBottom: "12px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                flexWrap: "wrap",
                fontSize: isMobile ? "12px" : "14px",
                color: "black",
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  backgroundColor: cameraReady ? "#4ade80" : "#94a3b8",
                  marginRight: "4px",
                }}
              />
              <span>
                {cameraReady ? "Camera ready" : "Waiting for camera..."}
              </span>
              <span>•</span>
              <span
                style={{
                  display: "inline-block",
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  backgroundColor: isModelLoaded ? "#4ade80" : "#94a3b8",
                  marginRight: "4px",
                }}
              />
              <span>{isModelLoaded ? "Model ready" : "Loading model..."}</span>
              <span>•</span>
              <span
                style={{
                  display: "inline-block",
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  backgroundColor: faceDetected ? "#4ade80" : "#94a3b8",
                  marginRight: "4px",
                }}
              />
              <span>{faceDetected ? "Face detected" : "No face detected"}</span>
              {isModelLoaded && (
                <>
                  <span>•</span>
                  <span>Runtime: {modelRuntime}</span>
                </>
              )}
            </div>

            <div
              style={{
                display: "flex",
                gap: "20px",
                alignItems: "flex-start",
                flexDirection: isMobile ? "column" : "row",
              }}
            >
              <div
                ref={wrapperRef}
                className="view-area"
                style={{
                  position: "relative",
                  height: "500px",
                  width: "350px",
                  transform: isMobile
                    ? "translateX(0px)"
                    : " translateX(-90px)",
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
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: "500px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: "rgba(0, 0, 0, 0.8)",
                    }}
                  >
                    <div
                      style={{
                        backgroundColor: "#1e293b",
                        borderRadius: "8px",
                        padding: "20px",
                        width: "80%",
                        maxWidth: "300px",
                      }}
                    >
                      <div
                        style={{
                          height: "8px",
                          backgroundColor: "#334155",
                          borderRadius: "4px",
                          marginBottom: "12px",
                          width: "60%",
                        }}
                      />
                      <div
                        style={{
                          height: "8px",
                          backgroundColor: "#334155",
                          borderRadius: "4px",
                          marginBottom: "12px",
                          width: "80%",
                        }}
                      />
                      <div
                        style={{
                          height: "8px",
                          backgroundColor: "#334155",
                          borderRadius: "4px",
                          width: "40%",
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {!isMobile && modelPanel}
            </div>
          </div>
        </div>

        <div
          className="controls"
          style={{
            flex: 1,
            width: "100%",
            marginLeft: isMobile ? 0 : "100px",
          }}
        >
          <div style={{ marginBottom: "24px" }}>
            <h2
              style={{
                margin: "0 0 8px 0",
                color: "black",
                fontSize: isMobile ? "20px" : "24px",
                fontWeight: "700",
              }}
            >
              AR Lipstick Try-On
            </h2>
            <p
              style={{
                margin: 0,
                color: "grey",
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
                  color: "black",
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
                    onClick={() => onShadeClick(shade)}
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
                  color: "black",
                  fontSize: "14px",
                }}
              >
                Lipstick Opacity:{" "}
                <span style={{ color: "grey", fontWeight: "700" }}>
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
                onChange={(event) =>
                  onOpacityChange(Number(event.target.value))
                }
              />
            </div>
          </div>
        </div>
      </div>
      {isMobile && <div style={{ marginTop: "20px" }}>{modelPanel}</div>}
    </div>
  );
};

export default ArTryOnUI;
