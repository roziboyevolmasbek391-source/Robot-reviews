"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function UzumVendorRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/vendors");
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-[400px] text-slate-500 text-sm">
      Перенаправление в Службы доставки...
    </div>
  );
}
