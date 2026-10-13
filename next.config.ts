import type { NextConfig } from "next";

// بیلد استاتیک (انتشار روی گیت‌هاب پیجز): NEXT_PUBLIC_DATA_MODE=local
// در این حالت تمام داده‌ها در مرورگر نگه داشته می‌شود و API هم سمت کلاینت اجرا می‌شود.
// بیلد پیش‌فرض (سروری): standalone + API + دیتابیس SQLite — رفتار قبلی دست‌نخورده.
const isStatic = process.env.NEXT_PUBLIC_DATA_MODE === "local";
const subpath = process.env.NEXT_PUBLIC_SUBPATH || "";

const nextConfig: NextConfig = {
  ...(isStatic
    ? {
        output: "export" as const,
        ...(subpath ? { basePath: subpath, assetPrefix: subpath } : {}),
      }
    : {
        output: "standalone" as const,
      }),
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
