import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BITRAM - 업비트 노코드 자동매매",
  description: "코딩 없이 업비트 자동매매 전략을 조립하고 실행하세요",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-[#0a0e17] text-gray-100 antialiased">
        {children}
      </body>
    </html>
  );
}
