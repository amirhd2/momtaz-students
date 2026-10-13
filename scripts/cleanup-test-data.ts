// پاکسازی داده‌های تستی و بازگرداندن برنامه به حالت اولیه تمیز
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function main() {
  // حذف سال 1405-1406 (تستی) با همه وابستگی‌ها
  const testYear = await db.year.findFirst({ where: { name: '1405-1406' } });
  if (testYear) {
    await db.year.delete({ where: { id: testYear.id } });
    console.log('deleted test year 1405-1406');
  }

  // یافتن سال اصلی
  const mainYear = await db.year.findFirst({ where: { name: '1404-1405' } });
  if (!mainYear) {
    console.log('main year not found!');
    return;
  }

  // پاک کردن داده‌های تستی سال اصلی
  const deletedStudents = await db.student.deleteMany({ where: { yearId: mainYear.id } });
  const deletedGroups = await db.groupRecord.deleteMany({ where: { yearId: mainYear.id } });
  const deletedSections = await db.section.deleteMany({ where: { yearId: mainYear.id } });

  // بازگرداندن ساختار پیش‌فرض: فقط بخش ستاد
  await db.section.create({
    data: { yearId: mainYear.id, name: 'ستاد', type: 'INDIVIDUAL' },
  });

  // اطمینان از فعال بودن سال اصلی
  await db.year.update({ where: { id: mainYear.id }, data: { isActive: true } });

  const counts = {
    students: deletedStudents.count,
    groups: deletedGroups.count,
    sections: deletedSections.count,
  };
  console.log('cleanup done:', JSON.stringify(counts));

  const remain = await db.year.findMany({ include: { sections: true } });
  console.log(
    'remaining years:',
    remain.map((y) => `${y.name} (active=${y.isActive}, sections=${y.sections.length})`).join(', ')
  );
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
