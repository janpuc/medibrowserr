import { ImageResponse } from "next/og";

// apple-touch-icon: full-bleed square (iOS applies its own corner mask).
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0b5fa5",
        }}
      >
        <svg width="110" height="110" viewBox="0 0 18 18">
          <path
            d="M9 2v5M9 11v5M2 9h5M11 9h5"
            stroke="#fff"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <circle cx="9" cy="9" r="1.6" fill="#fff" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
