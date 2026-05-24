import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Salon VII — Salle I | Van Gogh: The Wrong Man at the Right Time",
  description: "A digital art salon. Ten Van Gogh paintings. Zero buyers in his lifetime. One hundred and thirty years of the last laugh.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ margin: 0, padding: 0, background: "#0a0508", color: "#c9a98d", fontFamily: "'Cormorant Garamond', serif", WebkitFontSmoothing: "antialiased" }}>
        {children}
      </body>
    </html>
  );
}
