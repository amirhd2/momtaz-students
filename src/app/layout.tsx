import type { Metadata, Viewport } from "next";
import "@fontsource/vazirmatn/400.css";
import "@fontsource/vazirmatn/500.css";
import "@fontsource/vazirmatn/700.css";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "سامانه ثبت دانش‌آموزان ممتاز همکاران",
  description: "جمع‌آوری و مدیریت اطلاعات دانش‌آموزان ممتاز فرزندان همکاران سازمانی",
  // مانیفست وب‌اپ (نصب روی اندروید با آیکون اختصاصی) — نکست خودش basePath را اعمال می‌کند
  manifest: "/manifest.webmanifest",
  // فاویکون مرورگر + آیکون صفحه اصلی آیفون (apple-touch-icon)
  // SB: زیرمسیر انتشار استاتیک (مثلاً /momtaz-students روی گیت‌هاب پیجز) — نکست آیکون‌ها را prefix نمی‌کند
  icons: {
    icon: [
      { url: `${process.env.NEXT_PUBLIC_SUBPATH ?? ""}/favicon.ico`, sizes: "any", type: "image/x-icon" },
      { url: `${process.env.NEXT_PUBLIC_SUBPATH ?? ""}/favicon-32x32.png`, sizes: "32x32", type: "image/png" },
      { url: `${process.env.NEXT_PUBLIC_SUBPATH ?? ""}/favicon-16x16.png`, sizes: "16x16", type: "image/png" },
    ],
    apple: [
      {
        url: `${process.env.NEXT_PUBLIC_SUBPATH ?? ""}/apple-touch-icon.png`,
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
  // وب‌اپ روی آیفون — پس از «Add to Home Screen» تمام‌صفحه اجرا می‌شود
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "دانش‌آموزان ممتاز",
  },
  // جلوگیری از لینک‌شدن خودکار اعداد جداول به شماره تلفن در iOS
  formatDetection: { telephone: false },
};

// رنگ نوار وضعیت اندروید = سرمه‌ای هدر برنامه؛ viewport-fit برای ناچ آیفون
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#224167",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <head>
        {/* متای قدیمی iOS (سافار < 16.4) — برای حالت تمام‌صفحه پس از Add to Home Screen */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body className="antialiased bg-background text-foreground font-vazir min-h-screen flex flex-col">
        {children}
        <Toaster position="bottom-left" richColors dir="rtl" />
      </body>
    </html>
  );
}
