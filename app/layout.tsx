import type { Metadata } from "next";
import { IBM_Plex_Sans, Intel_One_Mono, K2D } from "next/font/google";
import "./globals.css";

const k2d = K2D({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--k2d-font",
});

const intelOneMono = Intel_One_Mono({
  subsets: ["latin"],
  weight: "400",
  variable: "--intel-font",
});

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: "variable",
  variable: "--ibm-plex-font",
});

export const metadata: Metadata = {
  title: "Tio Rico",
  description:
    "Assistente de investimentos que lembra de você e faz a conta certa.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${k2d.variable} ${intelOneMono.variable} ${ibmPlexSans.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <div className="flex min-h-dvh">
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
