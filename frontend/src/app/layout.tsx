import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://bitram.co.kr";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "BITRAM - 업비트 노코드 자동매매",
    template: "%s | BITRAM",
  },
  description: "코딩 없이 업비트 자동매매 전략을 조립하고 실행하세요",
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "BITRAM",
    title: "BITRAM - 업비트 노코드 자동매매",
    description: "코딩 없이 업비트 자동매매 전략을 조립하고 실행하세요",
    locale: "ko_KR",
  },
  twitter: {
    card: "summary_large_image",
    title: "BITRAM - 업비트 노코드 자동매매",
    description: "코딩 없이 업비트 자동매매 전략을 조립하고 실행하세요",
  },
};

const gaId = process.env.NEXT_PUBLIC_GA_ID;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const ldJson = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${siteUrl}#organization`,
        "name": "BITRAM",
        "url": siteUrl,
      },
      {
        "@type": "WebSite",
        "@id": `${siteUrl}#website`,
        "url": siteUrl,
        "name": "BITRAM",
        "publisher": { "@id": `${siteUrl}#organization` },
        "inLanguage": "ko-KR",
      },
    ],
  };

  return (
    <html lang="ko">
      <head>
        <script
          type="application/ld+json"
          // Rendered server-side; safe because we fully control the object.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ldJson) }}
        />
        {gaId && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
              strategy="afterInteractive"
            />
            <Script id="gtag-init" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${gaId}');
              `}
            </Script>
          </>
        )}
      </head>
      <body className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] antialiased">
        {children}
      </body>
    </html>
  );
}
