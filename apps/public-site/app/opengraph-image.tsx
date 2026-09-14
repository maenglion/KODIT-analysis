import { ImageResponse } from "next/og";

export const alt = "KODIT ANALYSIS";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#101b32",
        color: "#ffffff",
        fontSize: 78,
        fontWeight: 800,
        letterSpacing: "0.08em",
      }}
    >
      KODIT ANALYSIS
    </div>,
    size,
  );
}
