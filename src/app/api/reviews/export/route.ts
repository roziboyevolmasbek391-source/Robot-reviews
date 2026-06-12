import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { prisma } from "@/lib/prisma";
import { sessionOptions, SessionData } from "@/lib/session";
import { ReviewSource } from "@prisma/client";
import * as XLSX from "xlsx";

export async function GET(req: NextRequest) {
  try {
    const res = new NextResponse();
    const session = await getIronSession<SessionData>(req, res, sessionOptions);
    if (!session.isLoggedIn) {
      return NextResponse.json({ error: "Ruxsat etilmagan" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const format = searchParams.get("format") || "csv"; // csv or excel
    const source = searchParams.get("source") as ReviewSource | null;
    const rating = searchParams.get("rating") ? parseInt(searchParams.get("rating")!) : null;
    const branchId = searchParams.get("branchId") || null;
    const dateFrom = searchParams.get("dateFrom") ? new Date(searchParams.get("dateFrom")!) : null;
    const dateTo = searchParams.get("dateTo") ? new Date(searchParams.get("dateTo")!) : null;

    // WHERE shartlarini qurish
    const where: any = {};
    if (source) where.source = source;
    if (rating) where.rating = rating;
    if (branchId) where.branchId = branchId;
    if (dateFrom || dateTo) {
      where.reviewDate = {};
      if (dateFrom) where.reviewDate.gte = dateFrom;
      if (dateTo) where.reviewDate.lte = dateTo;
    }

    const reviews = await prisma.review.findMany({
      where,
      include: {
        branch: {
          select: { name: true },
        },
      },
      orderBy: { reviewDate: "desc" },
    });

    const data = reviews.map((r) => ({
      Sana: new Date(r.reviewDate).toLocaleDateString("ru-RU"),
      Vaqt: new Date(r.reviewDate).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
      Filial: r.branch?.name || "Noma'lum",
      Baho: r.rating,
      Muallif: r.author,
      Sharh: r.text || "",
      Havola: r.reviewUrl || "",
      Manba: r.source === "GOOGLE_MAPS" ? "Google Maps" : r.source === "YANDEX_MAPS" ? "Yandex Maps" : r.source === "YANDEX_VENDOR" ? "Yandex Vendor" : r.source === "UZUM_VENDOR" ? "Uzum Vendor" : "2GIS",
    }));

    if (format === "excel") {
      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Sharhlar");
      const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

      return new NextResponse(buffer, {
        headers: {
          "Content-Disposition": 'attachment; filename="sharhlar.xlsx"',
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
      });
    } else {
      // CSV eksport
      const worksheet = XLSX.utils.json_to_sheet(data);
      const csv = XLSX.utils.sheet_to_csv(worksheet);
      // UTF-8 BOM qo'shamiz (Excelda rus/o'zbek harflari buzilmasligi uchun)
      const csvContent = "\uFEFF" + csv;

      return new NextResponse(csvContent, {
        headers: {
          "Content-Disposition": 'attachment; filename="sharhlar.csv"',
          "Content-Type": "text/csv; charset=utf-8",
        },
      });
    }
  } catch (error) {
    console.error("Export API error:", error);
    return NextResponse.json({ error: "Serverda xatolik" }, { status: 500 });
  }
}
