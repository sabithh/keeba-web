import type { Metadata, Viewport } from "next";
import { DM_Sans, Playfair_Display } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-body",
});

const playfairDisplay = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-logo",
  weight: ["600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "Keeba",
    template: "%s | Keeba",
  },
  description: "Keeba personal AI assistant",
  applicationName: "Keeba",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      {
        url: "/icon.svg",
        type: "image/svg+xml",
      },
      {
        url: "/app-icon/192",
        sizes: "192x192",
        type: "image/png",
      },
      {
        url: "/app-icon/512",
        sizes: "512x512",
        type: "image/png",
      },
    ],
    shortcut: [
      {
        url: "/icon.svg",
        type: "image/svg+xml",
      },
    ],
  },
  appleWebApp: {
    capable: true,
    title: "Keeba",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1, // Prevents iOS input inner zoom
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#1c2028",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${dmSans.variable} ${playfairDisplay.variable}`}>
      <body>{children}</body>
    </html>
  );
}
