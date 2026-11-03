#!/usr/bin/env bash
# تست سناریوی «یک بار لود با اینترنت، سپس قطعی طولانی» برای سرویس‌ورکر آفلاین
# مراحل: لود اول + نصب SW → kill سرور (قطع اینترنت) → آفلاین مرورگر → رفرش و ورود
set -uo pipefail
cd "$(dirname "$0")/.."
PORT=4301
URL="http://localhost:$PORT/momtaz-students/"

cleanup() { pkill -f "serve-out.mjs" 2>/dev/null; agent-browser set offline off 2>/dev/null; agent-browser close 2>/dev/null; }
trap cleanup EXIT

echo "── ۱) سرور استاتیک + باز کردن اپ"
node scripts/serve-out.mjs out $PORT > .tmp/serve-out.log 2>&1 &
SERVER_PID=$!
sleep 1.5
agent-browser open "$URL" || exit 1
agent-browser wait --load networkidle 2>/dev/null
sleep 5

echo "── ۲) وضعیت سرویس‌ورکر و کش"
agent-browser eval "(async () => { const r = await navigator.serviceWorker.getRegistration(); if (!r) return 'NO-REG'; const keys = await caches.keys(); let n = 0; for (const k of keys) { if (k.startsWith('momtaz-offline-')) { const c = await caches.open(k); n = (await c.keys()).length; } } return JSON.stringify({controlled: !!navigator.serviceWorker.controller, caches: keys.length, precached: n}); })()"

echo "── ۳) قطع اینترنت: kill سرور + آفلاین مرورگر"
kill $SERVER_PID 2>/dev/null
pkill -f "serve-out.mjs" 2>/dev/null
agent-browser set offline on
sleep 1

echo "── ۴) رفرش صفحه در حالت آفلاین (باید از کش سرویس‌ورکر بیاید)"
agent-browser reload || exit 1
agent-browser wait --load networkidle 2>/dev/null
sleep 2
agent-browser snapshot -i -c | head -6

echo "── ۵) ورود در حالت آفلاین (لوکیتور سمانتیک، مستقل از ref)"
agent-browser find role textbox fill "1234"
agent-browser find role button click --name "ورود به سامانه"
sleep 3
agent-browser snapshot -i -c | head -10

echo "── ۶) نتیجه"
if agent-browser snapshot -i -c | grep -q "انتخاب سال فعال"; then
  echo "✅ PASS — برنامه کاملاً آفلاین اجرا شد (رفرش + ورود + داشبورد)"
else
  echo "❌ FAIL — داشبورد در آفلاین رندر نشد"
  exit 1
fi
