import { ImageResponse } from "next/og";

// PNG favicon — Safari ignores SVG favicons, PNG works everywhere.
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
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
          borderRadius: 14,
        }}
      >
        <svg width="42" height="42" viewBox="0 0 18 18">
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
