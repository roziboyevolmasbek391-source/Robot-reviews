"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import toast from "react-hot-toast";

interface BusinessFormData {
  name: string;
  category: string;
  description?: string;
  phone?: string;
  website?: string;
  email?: string;
  address?: string;
  keywords?: string[];
}

export function BusinessForm({ onSuccess }: { onSuccess?: () => void }) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<BusinessFormData>({
    name: "",
    category: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch("/api/businesses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!response.ok) throw new Error("Failed to create business");

      toast.success("Business created successfully");
      setFormData({ name: "", category: "" });
      onSuccess?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create business");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="p-6">
      <h2 className="text-xl font-semibold mb-6">Create Business</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">Business Name *</label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
            placeholder="Enter business name"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Category *</label>
          <select
            name="category"
            value={formData.category}
            onChange={handleChange}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
          >
            <option value="">Select category</option>
            <option value="restaurant">Restaurant</option>
            <option value="shop">Shop</option>
            <option value="service">Service</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Description</label>
          <textarea
            name="description"
            value={formData.description || ""}
            onChange={handleChange}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
            placeholder="Enter business description"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Phone</label>
            <input
              type="tel"
              name="phone"
              value={formData.phone || ""}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder="+1 (555) 000-0000"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Email</label>
            <input
              type="email"
              name="email"
              value={formData.email || ""}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder="info@example.com"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Website</label>
          <input
            type="url"
            name="website"
            value={formData.website || ""}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
            placeholder="https://example.com"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Address</label>
          <input
            type="text"
            name="address"
            value={formData.address || ""}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
            placeholder="Enter business address"
          />
        </div>

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Creating..." : "Create Business"}
        </Button>
      </form>
    </Card>
  );
}
