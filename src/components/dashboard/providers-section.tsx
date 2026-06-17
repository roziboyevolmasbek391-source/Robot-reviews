"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import toast from "react-hot-toast";

interface ProviderSession {
  id: string;
  provider: string;
  status: string;
  lastSuccessfulLogin: string | null;
  lastValidationAt: string | null;
  lastPublishAt: string | null;
}

export function ProvidersSection() {
  const [providers, setProviders] = useState<ProviderSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProviders();
  }, []);

  async function fetchProviders() {
    try {
      const response = await fetch("/api/providers/status");
      const data = await response.json();
      setProviders(data);
    } catch (error) {
      toast.error("Failed to fetch providers");
    } finally {
      setLoading(false);
    }
  }

  async function connectProvider(provider: string) {
    try {
      const response = await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });

      const data = await response.json();
      window.location.href = data.authUrl;
    } catch (error) {
      toast.error("Failed to connect provider");
    }
  }

  async function disconnectProvider(providerId: string) {
    try {
      await fetch(`/api/providers/${providerId}`, { method: "DELETE" });
      toast.success("Provider disconnected");
      fetchProviders();
    } catch (error) {
      toast.error("Failed to disconnect provider");
    }
  }

  const providers_list = ["YANDEX_BUSINESS", "GOOGLE_BUSINESS", "TWOGIS"];

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Connected Providers</h2>

      {providers_list.map((providerName) => {
        const session = providers.find((p) => p.provider === providerName);

        return (
          <Card key={providerName} className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold capitalize">
                  {providerName.replace(/_/g, " ")}
                </h3>
                <p className="text-sm text-gray-500">
                  {session ? (
                    <>
                      Status:{" "}
                      <Badge
                        variant={
                          session.status === "CONNECTED" ? "default" : "destructive"
                        }
                      >
                        {session.status}
                      </Badge>
                      {session.lastSuccessfulLogin && (
                        <span className="ml-2">
                          Last login: {new Date(session.lastSuccessfulLogin).toLocaleDateString()}
                        </span>
                      )}
                    </>
                  ) : (
                    "Not connected"
                  )}
                </p>
              </div>

              <div className="space-x-2">
                {session ? (
                  <Button
                    variant="destructive"
                    onClick={() => disconnectProvider(session.id)}
                  >
                    Disconnect
                  </Button>
                ) : (
                  <Button onClick={() => connectProvider(providerName)}>
                    Connect
                  </Button>
                )}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
