import { ImageResponse } from "next/og";

// Route segment config
export const runtime = "edge";

// Image metadata
export const size = {
  width: 180,
  height: 180,
};
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
          background: "#1c2028",
        }}
      >
        <svg width="100%" height="100%" viewBox="0 0 120 120" fill="none">
          <rect width="120" height="120" rx="28" fill="#1c2028" />
          <rect x="1" y="1" width="118" height="118" rx="27" stroke="#393E46" />
          <circle cx="60" cy="46" r="18" fill="none" stroke="#948979" strokeWidth="2.5" />
          <circle cx="60" cy="46" r="7" fill="#948979" />
          <path d="M34 82 C34 66 86 66 86 82" fill="none" stroke="#948979" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M44 90 C44 80 76 80 76 90" fill="none" stroke="#DFD0B8" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.5" />
          <text
            x="60"
            y="108"
            fill="#DFD0B8"
            fontFamily="serif"
            fontSize="11"
            fontWeight="600"
            letterSpacing="3"
            textAnchor="middle"
          >
            keeba
          </text>
        </svg>
      </div>
    ),
    {
      ...size,
    }
  );
}