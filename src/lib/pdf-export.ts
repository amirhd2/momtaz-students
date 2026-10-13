// تولید PDF از یک المان HTML با html2canvas-pro و jsPDF
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas-pro';

/**
 * تولید فایل PDF از المان داده‌شده (A4 چند صفحه‌ای)
 * المان باید با رنگ‌های صریح (hex) استایل شده باشد.
 */
export async function exportElementToPdf(element: HTMLElement, filename: string): Promise<void> {
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
  });

  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  const imgWidth = pageWidth - 10; // حاشیه 5mm از هر طرف
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  const imgData = canvas.toDataURL('image/jpeg', 0.95);

  // برش به چند صفحه در صورت بلند بودن محتوا
  const maxContentHeight = pageHeight - 10;
  if (imgHeight <= maxContentHeight) {
    pdf.addImage(imgData, 'JPEG', 5, 5, imgWidth, imgHeight);
  } else {
    // تقسیم canvas به نوارهای صفحه‌ای
    const pxPerMm = canvas.width / imgWidth;
    const pageSliceHeightPx = Math.floor(maxContentHeight * pxPerMm);
    let y = 0;
    let page = 0;
    while (y < canvas.height) {
      const sliceHeight = Math.min(pageSliceHeightPx, canvas.height - y);
      const sliceCanvas = document.createElement('canvas');
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = sliceHeight;
      const ctx = sliceCanvas.getContext('2d');
      if (!ctx) break;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
      ctx.drawImage(canvas, 0, y, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
      if (page > 0) pdf.addPage();
      pdf.addImage(sliceCanvas.toDataURL('image/jpeg', 0.95), 'JPEG', 5, 5, imgWidth, (sliceHeight * imgWidth) / canvas.width);
      y += sliceHeight;
      page += 1;
    }
  }

  pdf.save(filename);
}

/** ساخت المان مخفی برای رندر گزارش */
export function buildOffscreenReport(html: string): HTMLElement {
  const holder = document.createElement('div');
  holder.style.position = 'fixed';
  holder.style.right = '-10000px';
  holder.style.top = '0';
  holder.style.width = '794px'; // عرض A4 با 96dpi
  holder.style.background = '#ffffff';
  holder.innerHTML = html;
  document.body.appendChild(holder);
  return holder;
}

export function disposeOffscreenReport(element: HTMLElement): void {
  element.remove();
}

/** قالب HTML گزارش با استایل صریح (سازگار با html2canvas) */
export function reportShell(title: string, subtitleLines: string[], bodyHtml: string): string {
  return `
    <div style="direction: rtl; font-family: Vazirmatn, Tahoma, sans-serif; background: #ffffff; color: #1a1a2e; padding: 24px;">
      <div style="text-align: center; border-bottom: 3px solid #1f3a5f; padding-bottom: 12px; margin-bottom: 12px;">
        <div style="font-size: 20px; font-weight: 700; color: #1f3a5f;">${escapeHtml(title)}</div>
        ${subtitleLines.map((line) => `<div style="font-size: 12px; color: #555; margin-top: 4px;">${escapeHtml(line)}</div>`).join('')}
      </div>
      ${bodyHtml}
      <div style="margin-top: 16px; text-align: left; font-size: 10px; color: #999;">سامانه ثبت دانش‌آموزان ممتاز همکاران</div>
    </div>
  `;
}

/** ساخت جدول HTML استاندارد گزارش — در صورت دادن theadOverride، سربرگ سفارشی (مثلاً دوردیفه) استفاده می‌شود */
export function reportTable(headers: string[], rowsHtml: string, theadOverride?: string): string {
  const thead =
    theadOverride ??
    `<tr>
      ${headers
        .map(
          (h) =>
            `<th style="background: #1f3a5f; color: #ffffff; border: 1px solid #16304f; padding: 6px 4px; font-weight: 700; text-align: center;">${escapeHtml(h)}</th>`
        )
        .join('')}
    </tr>`;
  return `
    <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
      <thead>${thead}</thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  `;
}

export function reportCell(content: string, opts?: { bold?: boolean; center?: boolean; bg?: string; color?: string }): string {
  const style = [
    'border: 1px solid #c9d4e3',
    'padding: 4px 6px',
    opts?.bold ? 'font-weight: 700' : '',
    opts?.center === false ? 'text-align: right' : 'text-align: center',
    opts?.bg ? `background: ${opts.bg}` : '',
    opts?.color ? `color: ${opts.color}` : '',
  ]
    .filter(Boolean)
    .join('; ');
  return `<td style="${style}">${content}</td>`;
}

export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
