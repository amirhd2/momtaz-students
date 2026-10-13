import type { MetadataRoute } from "next";

// در بیلد استاتیک (گیت‌هاب پیجز) لازم است؛ محتوای مانیفست ثابت است و در نسخه سروری هم بی‌ضرر
export const dynamic = "force-static";

// مانیفست وب‌اپ — نصب روی اندروید (و دسکتاپ) با آیکون اختصاصی
// فایل‌های آیکون در public/ قرار دارند و همین مسیرها سرو می‌شوند
export default function manifest(): MetadataRoute.Manifest {
  return {
    // «.» نسبت به مسیر مانیفست حل می‌شود — هم در ریشه سرور و هم زیرمسیر گیت‌هاب پیجز درست است
    id: ".",
    name: "سامانه ثبت دانش‌آموزان ممتاز همکاران",
    short_name: "دانش‌آموزان ممتاز",
    description:
      "جمع‌آوری و مدیریت اطلاعات دانش‌آموزان ممتاز فرزندان همکاران سازمانی",
    dir: "rtl",
    lang: "fa",
    start_url: ".",
    scope: ".",
    display: "standalone",
    orientation: "any",
    background_color: "#ffffff",
    theme_color: "#224167",
    icons: [
      {
        src: "/android-chrome-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/android-chrome-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
