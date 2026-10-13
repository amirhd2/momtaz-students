import ExcelJS from 'exceljs';
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile('/home/z/my-project/.tmp/test-out/hq-rankunit.xlsx');
const ws = wb.getWorksheet('طبقه و واحد');
console.log('rowCount:', ws.rowCount, 'actualRowCount:', ws.actualRowCount);
for (let r = Math.max(5, ws.actualRowCount - 8); r <= ws.rowCount; r++) {
  const vals = [];
  for (let c = 1; c <= 10; c++) {
    const v = ws.getCell(r, c).value;
    vals.push(v === null || v === undefined ? '' : String(v).slice(0, 18));
  }
  console.log(r, '|', vals.join(' § '));
}
