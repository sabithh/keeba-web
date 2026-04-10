import { ImageResponse } from "next/og";

// Route segment config
export const runtime = "edge";

// Image metadata
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function Image() {
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
        <svg width="400" height="400" viewBox="0 0 120 120" fill="none">
          <rect width="120" height="120" rx="28" fill="#1c2028" />
          <rect x="1" y="1" width="118" height="118" rx="27" stroke="#393E46" />
          <path d="M45 54L73 42" stroke="#948979" strokeWidth="5" strokeLinecap="round" />
          <path d="M45 66L73 78" stroke="#948979" strokeWidth="5" strokeLinecap="round" />
          <path
            d="M47 54L71 43"
            stroke="#DFD0B8"
            strokeOpacity="0.45"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          <path
            d="M47 66L71 77"
            stroke="#DFD0B8"
            strokeOpacity="0.45"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          <circle cx="36" cy="60" r="11" stroke="#948979" strokeWidth="2.6" />
          <circle cx="82" cy="38" r="11" stroke="#948979" strokeWidth="2.6" />
          <circle cx="82" cy="82" r="11" stroke="#948979" strokeWidth="2.6" />
          <circle cx="36" cy="60" r="4" fill="#948979" />
          <circle cx="82" cy="38" r="4" fill="#948979" />
          <circle cx="82" cy="82" r="4" fill="#948979" />
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