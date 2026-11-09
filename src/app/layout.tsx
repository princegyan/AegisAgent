import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title:
    "AegisAgent | Autonomous Procurement & Programmable PayPal Settlement",
  description:
    "Autonomous Finance Control Plane with Deterministic Constraint Validation, Dual-Key Cryptographic Audit Logs, APIMatic OpenAPI Bindings, PayPal v2 Sandbox Settlement, and AG Grid Enterprise Flight Deck.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#F4F4F0] text-black antialiased selection:bg-[#FF90E8] selection:text-black">
        {children}
      </body>
    </html>
  );
}
