"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Setting {
  id: string;
  key: string;
  value: string;
  isSecret: boolean;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        setSettings(data.settings || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Check auth
    fetch("/api/auth/me")
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error();
      })
      .then((data) => {
        setUser(data.user);
        if (data.user?.role === "ADMIN") {
          loadSettings();
        }
      })
      .catch(() => {})
      .finally(() => setAuthLoading(false));
  }, []);

  const handleValueChange = (key: string, val: string) => {
    setSettings((prev) => {
      const exists = prev.some((s) => s.key === key);
      if (exists) {
        return prev.map((s) => (s.key === key ? { ...s, value: val } : s));
      } else {
        return [...prev, { id: "", key, value: val, isSecret: key.includes("KEY") || key.includes("TOKEN") || key.includes("SECRET") }];
      }
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatusMsg("");

    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      });

      if (res.ok) {
        setStatusMsg("Настройки успешно сохранены! (Секретные ключи зашифрованы)");
        loadSettings();
      } else {
        setStatusMsg("Произошла ошибка при сохранении настроек.");
      }
    } catch (e) {
      console.error(e);
      setStatusMsg("Ошибка при сохранении настроек.");
    } finally {
      setSaving(false);
    }
  };

  const handleImportEdaBranches = async () => {
    setImporting(true);
    setStatusMsg("Импорт филиалов Яндекс Еды...");
    try {
      const res = await fetch("/api/branches/import", {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        setStatusMsg(`Импорт завершен: ${data.message}`);
      } else {
        setStatusMsg(`Ошибка импорта: ${data.error || "Ошибка"}`);
      }
    } catch (e) {
      console.error(e);
      setStatusMsg("Произошла сетевая ошибка при запросе импорта.");
    } finally {
      setImporting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="text-center p-8 text-slate-500">Загрузка прав доступа...</div>
    );
  }

  if (!user || user.role !== "ADMIN") {
    return (
      <div className="flex flex-col items-center justify-center p-12 border border-slate-900 bg-slate-900/40 rounded-3xl max-w-xl mx-auto text-center space-y-4">
        <span className="text-4xl">🔒</span>
        <h3 className="text-lg font-bold text-white">У вас нет прав для доступа к этому разделу</h3>
        <p className="text-slate-400 text-xs">Данная страница доступна только администраторам системы.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center p-8 text-slate-500">Загрузка...</div>
    );
  }

  const getSetting = (key: string) => settings.find((s) => s.key === key);

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight">System & API Settings</h2>
        <p className="text-slate-400 text-sm">Настройка интеграций, API ключей и времени синхронизатора</p>
      </div>

      <form onSubmit={handleSave} className="space-y-6 text-xs">
        {statusMsg && (
          <div className={`p-4 rounded-xl border ${
            statusMsg.includes("успешно") || statusMsg.includes("завершен")
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" 
              : "bg-red-500/10 border-red-500/20 text-red-400"
          }`}>
            {statusMsg}
          </div>
        )}

        {/* Category 1: General settings */}
        <Card className="border-slate-800 bg-slate-900/20 text-slate-100">
          <CardHeader>
            <CardTitle className="text-sm font-bold text-white">Настройки синхронизации</CardTitle>
            <CardDescription className="text-slate-400 text-[10px]">Настройте интервал времени сбора отзывов в фоновом режиме.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-slate-300 font-medium">Интервал синхронизации (в минутах)</label>
                <Input
                  type="number"
                  value={getSetting("SYNC_INTERVAL_MINUTES")?.value || "10"}
                  onChange={(e) => handleValueChange("SYNC_INTERVAL_MINUTES", e.target.value)}
                  className="bg-slate-950 border-slate-800 text-white h-9"
                  min="1"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Category 2: Telegram Settings */}
        <Card className="border-slate-800 bg-slate-900/20 text-slate-100">
          <CardHeader>
            <CardTitle className="text-sm font-bold text-white">Уведомления Telegram</CardTitle>
            <CardDescription className="text-slate-400 text-[10px]">Настройки отправки сообщений в Telegram-группу при поступлении негативных отзывов (оценка 2 и ниже).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-slate-300 font-medium">Токен Telegram-бота (через BotFather)</label>
                <Input
                  type="password"
                  value={getSetting("TELEGRAM_BOT_TOKEN")?.value || ""}
                  onChange={(e) => handleValueChange("TELEGRAM_BOT_TOKEN", e.target.value)}
                  className="bg-slate-950 border-slate-800 text-white h-9"
                  placeholder="1234567890:ABC..."
                />
              </div>
              <div className="space-y-2">
                <label className="text-slate-300 font-medium">ID Telegram-чата (ID группы или канала)</label>
                <Input
                  type="text"
                  value={getSetting("TELEGRAM_CHAT_ID")?.value || ""}
                  onChange={(e) => handleValueChange("TELEGRAM_CHAT_ID", e.target.value)}
                  className="bg-slate-950 border-slate-800 text-white h-9"
                  placeholder="-100123456789"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Category 3: Google & Yandex & 2GIS API Settings */}
        <Card className="border-slate-800 bg-slate-900/20 text-slate-100">
          <CardHeader>
            <CardTitle className="text-sm font-bold text-white">API Интеграции</CardTitle>
            <CardDescription className="text-slate-400 text-[10px]">Ключи для Google Maps, Yandex Vendor и других сервисов.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-slate-300 font-medium">Yandex Vendor API Key</label>
                <Input
                  type="password"
                  value={getSetting("YANDEX_VENDOR_API_KEY")?.value || ""}
                  onChange={(e) => handleValueChange("YANDEX_VENDOR_API_KEY", e.target.value)}
                  className="bg-slate-950 border-slate-800 text-white h-9"
                  placeholder="Yandex Partner API Key"
                />
              </div>
              <div className="space-y-2">
                <label className="text-slate-300 font-medium">Yandex Vendor Business ID</label>
                <Input
                  type="text"
                  value={getSetting("YANDEX_VENDOR_BUSINESS_ID")?.value || ""}
                  onChange={(e) => handleValueChange("YANDEX_VENDOR_BUSINESS_ID", e.target.value)}
                  className="bg-slate-950 border-slate-800 text-white h-9"
                  placeholder="Yandex Business ID"
                />
              </div>
              <div className="space-y-2 col-span-2 border-b border-slate-900/40 pb-3">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-slate-300 font-medium">Yandex Eda Cookie (для сессии)</label>
                  {(getSetting("YANDEX_EDA_COOKIE")?.value || getSetting("YANDEX_EDA_OAUTH")?.value) && (
                    <Button
                      type="button"
                      onClick={handleImportEdaBranches}
                      disabled={importing}
                      className="bg-violet-600 hover:bg-violet-500 text-white h-7 text-[10px] px-3"
                    >
                      {importing ? "Загрузка..." : "🏢 Автоматическая загрузка филиалов (Импорт)"}
                    </Button>
                  )}
                </div>
                <Input
                  type="password"
                  value={getSetting("YANDEX_EDA_COOKIE")?.value || ""}
                  onChange={(e) => handleValueChange("YANDEX_EDA_COOKIE", e.target.value)}
                  className="bg-slate-950 border-slate-800 text-white h-9 text-[10px] mb-3"
                  placeholder="Yandex Eda Cookie (необязательно, если достаточно OAuth токена)"
                />
                
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 mt-2">
                  <div className="space-y-2">
                    <label className="text-slate-400">Yandex Eda OAuth Token (X-Oauth)</label>
                    <Input
                      type="password"
                      value={getSetting("YANDEX_EDA_OAUTH")?.value || ""}
                      onChange={(e) => handleValueChange("YANDEX_EDA_OAUTH", e.target.value)}
                      className="bg-slate-950 border-slate-800 text-white h-9 text-[10px]"
                      placeholder="Bearer y0_..."
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-slate-400">Yandex Eda Partner ID (X-Partner-Id)</label>
                    <Input
                      type="text"
                      value={getSetting("YANDEX_EDA_PARTNER_ID")?.value || ""}
                      onChange={(e) => handleValueChange("YANDEX_EDA_PARTNER_ID", e.target.value)}
                      className="bg-slate-950 border-slate-800 text-white h-9 text-[10px]"
                      placeholder="2618f6ac-daca-..."
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-2 col-span-2 border-t border-slate-900 pt-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider">Google Maps OAuth</p>
                  {getSetting("GOOGLE_CLIENT_ID")?.value && getSetting("GOOGLE_CLIENT_ID")?.value !== "********" && (
                    <a href="/api/auth/google">
                      <Button type="button" variant="outline" className="border-violet-800 text-violet-400 hover:bg-violet-600/10 h-7 text-[10px] px-3">
                        🔑 Подключить аккаунт Google
                      </Button>
                    </a>
                  )}
                </div>
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
                  <div className="space-y-2">
                    <label className="text-slate-400">Google Client ID</label>
                    <Input
                      type="password"
                      value={getSetting("GOOGLE_CLIENT_ID")?.value || ""}
                      onChange={(e) => handleValueChange("GOOGLE_CLIENT_ID", e.target.value)}
                      className="bg-slate-950 border-slate-800 text-white h-9 text-[10px]"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-slate-400">Google Client Secret</label>
                    <Input
                      type="password"
                      value={getSetting("GOOGLE_CLIENT_SECRET")?.value || ""}
                      onChange={(e) => handleValueChange("GOOGLE_CLIENT_SECRET", e.target.value)}
                      className="bg-slate-950 border-slate-800 text-white h-9 text-[10px]"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-slate-400">Google Refresh Token</label>
                    <Input
                      type="password"
                      value={getSetting("GOOGLE_REFRESH_TOKEN")?.value || ""}
                      onChange={(e) => handleValueChange("GOOGLE_REFRESH_TOKEN", e.target.value)}
                      className="bg-slate-950 border-slate-800 text-white h-9 text-[10px]"
                      placeholder="Заполняется автоматически при подключении аккаунта Google"
                    />
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Category 4: Uzum Vendor Settings */}
        <Card className="border-slate-800 bg-slate-900/20 text-slate-100">
          <CardHeader>
            <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
              🟠 Интеграция Uzum Vendor
            </CardTitle>
            <CardDescription className="text-slate-400 text-[10px]">
              Настройки сессии Uzum Tezkor. Для автоматического получения токенов запустите команду <code className="text-orange-400 bg-slate-950 px-1 py-0.5 rounded">node sync-uzum-web.js</code> на сервере.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
              <div className="space-y-2 col-span-2">
                <label className="text-slate-300 font-medium">Uzum Tezkor Authorization Token</label>
                <Input
                  type="password"
                  value={getSetting("UZUM_TOKEN")?.value || ""}
                  onChange={(e) => handleValueChange("UZUM_TOKEN", e.target.value)}
                  className="bg-slate-950 border-slate-800 text-white h-9 text-[10px]"
                  placeholder="Bearer eyJhbGci..."
                />
              </div>
              <div className="space-y-2 col-span-2">
                <label className="text-slate-300 font-medium">Uzum Tezkor Cookie</label>
                <Input
                  type="password"
                  value={getSetting("UZUM_COOKIE")?.value || ""}
                  onChange={(e) => handleValueChange("UZUM_COOKIE", e.target.value)}
                  className="bg-slate-950 border-slate-800 text-white h-9 text-[10px]"
                  placeholder="session_id=..."
                />
              </div>
              <div className="space-y-2 col-span-2">
                <label className="text-slate-300 font-medium">Uzum Merchant ID (необязательно)</label>
                <Input
                  type="text"
                  value={getSetting("UZUM_MERCHANT_ID")?.value || ""}
                  onChange={(e) => handleValueChange("UZUM_MERCHANT_ID", e.target.value)}
                  className="bg-slate-950 border-slate-800 text-white h-9"
                  placeholder="Uzum Partner Merchant ID"
                />
              </div>
            </div>
          </CardContent>
        </Card>


        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button
            type="submit"
            disabled={saving}
            className="bg-violet-600 hover:bg-violet-500 text-white text-xs px-8 h-10"
          >
            {saving ? "Сохранение..." : "Сохранить настройки ✓"}
          </Button>
        </div>
      </form>
    </div>
  );
}
