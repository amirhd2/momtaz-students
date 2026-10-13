#!/usr/bin/env bash
# سینک سورس تمیز برنامه به گیت‌هاب — https://github.com/amirhd2/momtaz-students
# استفاده:  bash scripts/github-sync.sh ["پیام کامیت دلخواه"]
#
# نکته: زنجیره کامیت‌های گیت‌هاب روی برنچ لوکال «github-main» نگه داشته می‌شود
# و همیشه از درختِ تمیزِ HEAD ساخته می‌شود (فایل‌های .env، دیتابیس و
# خروجی‌های تست طبق .gitignore هرگز وارد ریپوی گیت‌هاب نمی‌شوند).
set -euo pipefail
cd "$(dirname "$0")/.."

MSG="${1:-sync: به‌روزرسانی سورس $(date '+%Y-%m-%d %H:%M')}"

# ۱) هر تغییر working tree را روی main لوکال ثبت کن تا چیزی گم نشود
git add -A
if ! git diff --cached --quiet; then
  git commit -q -m "sync: apply working tree state"
fi

# ۲) ساخت درخت تمیز با ایندکس موقت (بدون جابه‌جایی برنچ یا تغییر فایل‌ها)
IDX=.git/github-sync-index
export GIT_INDEX_FILE="$IDX"
git read-tree HEAD
TREE=$(git write-tree)
unset GIT_INDEX_FILE
rm -f "$IDX"

# ۳) اگر نسبت به آخرین سینک تغییری نبود، ادامه نده
LAST=$(git rev-parse -q --verify github-main^{tree} || echo none)
if [ "$LAST" = "$TREE" ]; then
  echo "چیز جدیدی برای سینک نیست"
  exit 0
fi

# ۴) ادامه زنجیره تمیز روی گیت‌هاب
PARENT=$(git rev-parse github-main)
COMMIT=$(GIT_AUTHOR_NAME="amirhd2" GIT_AUTHOR_EMAIL="amirhd2@users.noreply.github.com" \
GIT_COMMITTER_NAME="amirhd2" GIT_COMMITTER_EMAIL="amirhd2@users.noreply.github.com" \
git commit-tree "$TREE" -p "$PARENT" -m "$MSG")
git branch -f github-main "$COMMIT"

# ۵) ارسال (توکن داخل remote URL در .git/config است و هرگز منتشر نمی‌شود)
git push origin github-main:main
echo ""
echo "سینک شد ← https://github.com/amirhd2/momtaz-students  (کامیت: ${COMMIT:0:7})"
