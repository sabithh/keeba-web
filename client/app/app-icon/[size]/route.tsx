import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

const ALLOWED_SIZES = new Set([180, 192, 512]);

function renderIcon(size: number): ImageResponse {
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
          <circle cx="60" cy="46" r="18" stroke="#948979" strokeWidth="2.5" />
          <circle cx="60" cy="46" r="7" fill="#948979" />
          <path d="M34 82C34 66 86 66 86 82" stroke="#948979" strokeWidth="2.5" strokeLinecap="round" />
          <path
            d="M44 90C44 80 76 80 76 90"
            stroke="#DFD0B8"
            strokeOpacity="0.5"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
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
      width: size,
      height: size,
    }
  );
}

export async function GET(
  _request: NextRequest,
  context: { params: { size: string } }
): Promise<Response> {
  const parsedSize = Number(context.params.size);

  if (!Number.isFinite(parsedSize) || !ALLOWED_SIZES.has(parsedSize)) {
    return new Response("Not Found", { status: 404 });
  }

  return renderIcon(parsedSize);
}
