import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Literata } from "next/font/google";
import { cookies } from "next/headers";
import { SiteFooter } from "@/components/SiteFooter";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
import "./globals.css";

// next/font descarga las fuentes al compilar y las sirve desde nuestro dominio:
// el navegador no hace ninguna petición a Google.
const literata = Literata({ variable: "--font-literata", subsets: ["latin"] });
const plexSans = IBM_Plex_Sans({ variable: "--font-plex-sans", subsets: ["latin"], weight: ["400", "500", "600"] });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: { default: "Diario cifrado", template: "%s · Diario cifrado" },
  description: "Un diario personal cifrado de extremo a extremo: el servidor solo ve texto ilegible.",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <html
      lang="es"
      data-theme={theme === "system" ? undefined : theme}
      className={`${literata.variable} ${plexSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <a
          href="#contenido"
          className="sr-only rounded-md bg-accent px-4 py-2 text-on-accent focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
        >
          Saltar al contenido
        </a>
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
