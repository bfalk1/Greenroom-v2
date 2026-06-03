import localFont from "next/font/local";

// Eurostile is a licensed font, kept local under src/app/fonts. The file is a
// single regular master, so we pin it to weight 400 and let the browser
// synthesize bold when 700 is requested.
export const eurostile = localFont({
  src: "../app/fonts/eurostile.ttf",
  weight: "400",
  style: "normal",
  variable: "--font-eurostile",
  display: "swap",
});

export const display = { fontFamily: "var(--font-eurostile)", fontWeight: 700 } as const;
