import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "BITRAM - 업비트 노코드 자동매매";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
          fontFamily: "sans-serif",
        }}
      >
        {/* Logo area */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "20px",
            marginBottom: "40px",
          }}
        >
          <div
            style={{
              width: "80px",
              height: "80px",
              borderRadius: "16px",
              background: "linear-gradient(135deg, #3182F6, #1B64DA)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "40px",
              fontWeight: 800,
              color: "white",
            }}
          >
            B
          </div>
          <div
            style={{
              fontSize: "64px",
              fontWeight: 800,
              color: "white",
              letterSpacing: "-2px",
            }}
          >
            BITRAM
          </div>
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: "32px",
            fontWeight: 600,
            color: "#94a3b8",
            marginBottom: "16px",
          }}
        >
          업비트 노코드 자동매매
        </div>

        {/* Description */}
        <div
          style={{
            fontSize: "22px",
            color: "#64748b",
          }}
        >
          코딩 없이 자동매매 전략을 조립하고 실행하세요
        </div>

        {/* Bottom accent */}
        <div
          style={{
            position: "absolute",
            bottom: "40px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <div
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: "#3182F6",
            }}
          />
          <div
            style={{
              fontSize: "18px",
              color: "#3182F6",
              fontWeight: 600,
            }}
          >
            bitram.co.kr
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
