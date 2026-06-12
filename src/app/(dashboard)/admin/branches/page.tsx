"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Branch {
  id: string;
  name: string;
  city: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  platformIds: Array<{ source: string; platformId: string }>;
  isActive: boolean;
}

export default function BranchesPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Dialog (Modal) states
  const [isOpen, setIsOpen] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);

  // Form states
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  
  // Platforms ID's
  const [googleId, setGoogleId] = useState("");
  const [yandexId, setYandexId] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [dgisId, setDgisId] = useState("");
  const [uzumId, setUzumId] = useState("");

  const loadBranches = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/branches");
      const data = await res.json();
      setBranches(data.branches || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBranches();
  }, []);

  const handleOpenAdd = () => {
    setSelectedBranch(null);
    setName("");
    setCity("");
    setAddress("");
    setLatitude("");
    setLongitude("");
    setGoogleId("");
    setYandexId("");
    setVendorId("");
    setDgisId("");
    setUzumId("");
    setIsOpen(true);
  };

  const handleOpenEdit = (branch: Branch) => {
    setSelectedBranch(branch);
    setName(branch.name);
    setCity(branch.city);
    setAddress(branch.address);
    setLatitude(branch.latitude ? String(branch.latitude) : "");
    setLongitude(branch.longitude ? String(branch.longitude) : "");

    const getPlatId = (src: string) => branch.platformIds.find((p) => p.source === src)?.platformId || "";
    setGoogleId(getPlatId("GOOGLE_MAPS"));
    setYandexId(getPlatId("YANDEX_MAPS"));
    setVendorId(getPlatId("YANDEX_VENDOR"));
    setDgisId(getPlatId("DGIS"));
    setUzumId(getPlatId("UZUM_VENDOR"));

    setIsOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name,
      city,
      address,
      latitude: latitude ? parseFloat(latitude) : null,
      longitude: longitude ? parseFloat(longitude) : null,
      platformIds: [
        { source: "GOOGLE_MAPS", platformId: googleId },
        { source: "YANDEX_MAPS", platformId: yandexId },
        { source: "YANDEX_VENDOR", platformId: vendorId },
        { source: "DGIS", platformId: dgisId },
        { source: "UZUM_VENDOR", platformId: uzumId },
      ],
    };

    try {
      const url = selectedBranch ? `/api/branches/${selectedBranch.id}` : "/api/branches";
      const method = selectedBranch ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setIsOpen(false);
        loadBranches();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Вы действительно хотите удалить этот филиал? Все связанные отзывы также будут удалены!")) return;
    try {
      const res = await fetch(`/api/branches/${id}`, { method: "DELETE" });
      if (res.ok) {
        loadBranches();
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Управление филиалами</h2>
          <p className="text-slate-400 text-sm">Настройка данных всех филиалов и их API/Scraper ID</p>
        </div>
        <Button onClick={handleOpenAdd} className="bg-violet-600 hover:bg-violet-500 text-white text-xs w-full sm:w-auto">
          ➕ Добавить новый филиал
        </Button>
      </div>

      {/* Grid List */}
      {loading ? (
        <div className="text-center p-8 text-slate-500">Загрузка...</div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {branches.map((b) => (
            <Card key={b.id} className="border-slate-800 bg-slate-900/20 text-slate-100 flex flex-col justify-between">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-base font-bold text-white">{b.name}</CardTitle>
                <CardDescription className="text-slate-400 text-xs">{b.city} | {b.address}</CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-4 flex-1">
                {/* Platform ID nishonlari */}
                <div className="space-y-1.5 mt-2">
                  <p className="text-[10px] uppercase font-semibold text-slate-500">Подключения (ID платформ):</p>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className="bg-slate-950 p-1.5 rounded-lg border border-slate-900 truncate">
                      🔵 Google: <span className="text-slate-400">{b.platformIds.find(p => p.source === "GOOGLE_MAPS")?.platformId || "Не подключено"}</span>
                    </div>
                    <div className="bg-slate-950 p-1.5 rounded-lg border border-slate-900 truncate">
                      🔴 Yandex: <span className="text-slate-400">{b.platformIds.find(p => p.source === "YANDEX_MAPS")?.platformId || "Не подключено"}</span>
                    </div>
                    <div className="bg-slate-950 p-1.5 rounded-lg border border-slate-900 truncate">
                      🟢 2GIS: <span className="text-slate-400">{b.platformIds.find(p => p.source === "DGIS")?.platformId || "Не подключено"}</span>
                    </div>
                    <div className="bg-slate-950 p-1.5 rounded-lg border border-slate-900 truncate">
                      🟣 Yandex Vendor: <span className="text-slate-400">{b.platformIds.find(p => p.source === "YANDEX_VENDOR")?.platformId || "Не подключено"}</span>
                    </div>
                    <div className="bg-slate-950 p-1.5 rounded-lg border border-slate-900 truncate col-span-2">
                      🟠 Uzum Vendor: <span className="text-slate-400">{b.platformIds.find(p => p.source === "UZUM_VENDOR")?.platformId || "Не подключено"}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
              <div className="p-4 border-t border-slate-900 bg-slate-900/10 flex gap-2">
                <Button onClick={() => handleOpenEdit(b)} size="sm" variant="outline" className="flex-1 border-slate-800 text-xs">
                  Редактировать ⚙️
                </Button>
                <Button onClick={() => handleDelete(b.id)} size="sm" variant="outline" className="border-red-900 text-red-400 hover:bg-red-500/10 hover:text-red-300 text-xs">
                  Удалить 🗑️
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-slate-100 max-w-lg overflow-y-auto max-h-[85vh] p-6 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-white text-base">
              {selectedBranch ? "Редактировать филиал" : "Добавить новый филиал"}
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">
              Введите название, адрес и уникальные идентификаторы филиала на платформах.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 my-2 text-xs">
            {/* Asosiy ma'lumotlar */}
            <div className="space-y-3 p-4 bg-slate-950 rounded-xl border border-slate-900">
              <p className="text-[10px] uppercase font-bold text-violet-400">Основная информация</p>
              <div className="space-y-2">
                <label className="text-slate-400">Название филиала *</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} required className="bg-slate-900 border-slate-800 text-white h-9" placeholder="Например: Чиланзарский филиал" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <label className="text-slate-400">Город *</label>
                  <Input value={city} onChange={(e) => setCity(e.target.value)} required className="bg-slate-900 border-slate-800 text-white h-9" placeholder="Ташкент" />
                </div>
                <div className="space-y-2">
                  <label className="text-slate-400">Адрес *</label>
                  <Input value={address} onChange={(e) => setAddress(e.target.value)} required className="bg-slate-900 border-slate-800 text-white h-9" placeholder="улица Чиланзар, д. 12" />
                </div>
              </div>
            </div>

            {/* Platformalar ID'si */}
            <div className="space-y-3 p-4 bg-slate-950 rounded-xl border border-slate-900">
              <p className="text-[10px] uppercase font-bold text-violet-400">Идентификаторы платформ (API / Scraper ID)</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <label className="text-slate-400">Google Maps Place ID</label>
                  <Input value={googleId} onChange={(e) => setGoogleId(e.target.value)} className="bg-slate-900 border-slate-800 text-white h-9 text-[10px]" placeholder="ChIJa2d..." />
                </div>
                <div className="space-y-2">
                  <label className="text-slate-400">Yandex Maps Org ID</label>
                  <Input value={yandexId} onChange={(e) => setYandexId(e.target.value)} className="bg-slate-900 border-slate-800 text-white h-9 text-[10px]" placeholder="1234567890" />
                </div>
                <div className="space-y-2">
                  <label className="text-slate-400">2GIS Firm/Branch ID</label>
                  <Input value={dgisId} onChange={(e) => setDgisId(e.target.value)} className="bg-slate-900 border-slate-800 text-white h-9 text-[10px]" placeholder="700000..." />
                </div>
                <div className="space-y-2">
                  <label className="text-slate-400">Yandex Vendor Campaign ID</label>
                  <Input value={vendorId} onChange={(e) => setVendorId(e.target.value)} className="bg-slate-900 border-slate-800 text-white h-9 text-[10px]" placeholder="yandex_vendor_..." />
                </div>
                <div className="space-y-2 col-span-2">
                  <label className="text-slate-400">Uzum Vendor ID</label>
                  <Input value={uzumId} onChange={(e) => setUzumId(e.target.value)} className="bg-slate-900 border-slate-800 text-white h-9 text-[10px]" placeholder="uzum_vendor_..." />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3">
              <Button onClick={() => setIsOpen(false)} type="button" variant="outline" className="border-slate-800 text-slate-300 text-xs h-9">
                Отмена
              </Button>
              <Button type="submit" className="bg-violet-600 hover:bg-violet-500 text-white text-xs h-9 px-6">
                Сохранить
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
