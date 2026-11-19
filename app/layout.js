import "./globals.css";

export const metadata = {
  title: "Sibiya AI - Umoya WeSizwe SakwaZulu",
  description: "Everyone can create, everyone can invite. Type @sibiya to chat",
  openGraph: {
    title: "Sibiya AI - Umoya WeSizwe SakwaZulu",
    description: "Everyone can create, everyone can invite",
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Sibiya AI - Umoya WeSizwe SakwaZulu",
      },
    ],
    url: "https://sibiya-ai.vercel.app",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Sibiya AI - Umoya WeSizwe SakwaZulu",
    description: "Everyone can create, everyone can invite",
    images: ["/og-image.jpg"],
  },
};
<script async src="https://www.googletagmanager.com/gtm.js?id=G-VZWQJEKCXN"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
</script>
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
