import { PrismaClient, ReviewSource, UserRole } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  console.log("Seed boshlanmoqda...");

  // 1. Admin foydalanuvchisini yaratish
  const existingAdmin = await prisma.user.findUnique({
    where: { username: "admin" },
  });

  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash("admin12345", 10);
    await prisma.user.create({
      data: {
        username: "admin",
        passwordHash,
        fullName: "Tizim Administratori",
        role: UserRole.ADMIN,
        isActive: true,
      },
    });
    console.log("Admin yaratildi: admin / admin12345");
  } else {
    console.log("Admin allaqachon mavjud.");
  }

  // 1.2. Operator foydalanuvchisini yaratish (username: "user", password: "user12345")
  const existingUser = await prisma.user.findUnique({
    where: { username: "user" },
  });

  if (!existingUser) {
    const passwordHash = await bcrypt.hash("user12345", 10);
    await prisma.user.create({
      data: {
        username: "user",
        passwordHash,
        fullName: "Oddiy Foydalanuvchi",
        role: UserRole.OPERATOR,
        isActive: true,
      },
    });
    console.log("Operator yaratildi: user / user12345");
  } else {
    console.log("Operator allaqachon mavjud.");
  }

  // 2. Namuna sifatida 1 ta filial yaratish
  const existingBranchesCount = await prisma.branch.count();
  if (existingBranchesCount === 0) {
    console.log("1 ta asosiy filial yaratilmoqda...");

    const branch = await prisma.branch.create({
      data: {
        name: "Markaziy filial (Bosh Ofis)",
        city: "Tashkent",
        address: "Tashkent shahar, Chilonzor ko'chasi, 10-uy",
        latitude: 41.311081,
        longitude: 69.240562,
        isActive: true,
      },
    });

    // Ular uchun bo'sh platforma ulanishlarini yaratamiz
    await prisma.branchPlatformId.createMany({
      data: [
        {
          branchId: branch.id,
          source: ReviewSource.GOOGLE_MAPS,
          platformId: "", // Google ulanishi uchun o'zingiz kiritasiz
        },
        {
          branchId: branch.id,
          source: ReviewSource.YANDEX_MAPS,
          platformId: "", // Yandex Maps ulanishi uchun
        },
        {
          branchId: branch.id,
          source: ReviewSource.DGIS,
          platformId: "", // 2GIS ulanishi uchun
        },
        {
          branchId: branch.id,
          source: ReviewSource.YANDEX_VENDOR,
          platformId: "", // Yandex Eda (place_id) ulanishi uchun
        },
      ],
    });

    console.log("Markaziy filial yaratildi va platforma ID'lari bog'landi.");
  } else {
    console.log("Filiallar allaqachon mavjud.");
  }

  // 3. Tizim sozlamalari boshlang'ich qiymatlari
  const defaultSettings = [
    { key: "SYNC_INTERVAL_MINUTES", value: "10", isSecret: false },
    { key: "TELEGRAM_BOT_TOKEN", value: "", isSecret: true },
    { key: "TELEGRAM_CHAT_ID", value: "", isSecret: false },
    { key: "GOOGLE_CLIENT_ID", value: "", isSecret: true },
    { key: "GOOGLE_CLIENT_SECRET", value: "", isSecret: true },
    { key: "GOOGLE_REFRESH_TOKEN", value: "", isSecret: true },
    { key: "YANDEX_VENDOR_API_KEY", value: "", isSecret: true },
    { key: "YANDEX_VENDOR_BUSINESS_ID", value: "", isSecret: false },
    { key: "YANDEX_EDA_COOKIE", value: "", isSecret: true },
    { key: "YANDEX_EDA_OAUTH", value: "", isSecret: true },
    { key: "YANDEX_EDA_PARTNER_ID", value: "", isSecret: false },
    { key: "DGIS_API_KEY", value: "", isSecret: true },
  ];

  for (const setting of defaultSettings) {
    const exists = await prisma.systemSetting.findUnique({
      where: { key: setting.key },
    });
    if (!exists) {
      await prisma.systemSetting.create({
        data: setting,
      });
    }
  }
  console.log("Tizim sozlamalari yaratildi.");

  console.log("Seed yakunlandi.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
