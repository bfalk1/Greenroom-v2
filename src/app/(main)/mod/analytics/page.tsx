"use client";

import React, { useState } from "react";
import { BarChart3, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AnalyticsOverview from "@/components/admin/analytics/AnalyticsOverview";
import { SubscribersPanel } from "@/components/admin/SubscribersPanel";
import { useUser } from "@/lib/hooks/useUser";

/**
 * /mod/analytics — site and subscriber analytics for staff (MODERATOR or
 * ADMIN), so the creative team can read the numbers without an admin account.
 *
 * Same two panels the admin dashboard mounts, backed by the same read-only
 * endpoints (/api/admin/analytics, .../trend, /api/admin/subscribers), which
 * accept staff. Nothing here writes: moderators still can't touch payouts,
 * invites, settings, moderator management or the CSV exports.
 */
export default function ModAnalyticsPage() {
  const router = useRouter();
  const { user } = useUser();
  const [activeTab, setActiveTab] = useState("overview");

  // CSV reports come from the admin-only export route; hide the menu for
  // moderators rather than hand them a button that downloads a 403.
  const isAdmin = user?.role === "ADMIN";

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Analytics</h1>
          <p className="text-[#a1a1a1]">
            How the platform and its subscriber base are doing.
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="bg-[#1a1a1a] border border-[#2a2a2a] p-1 mb-8">
            <TabsTrigger
              value="overview"
              className="data-[state=active]:bg-[#39b54a] data-[state=active]:text-black"
            >
              <BarChart3 className="w-4 h-4 mr-2" />
              Site
            </TabsTrigger>
            <TabsTrigger
              value="subscribers"
              className="data-[state=active]:bg-[#39b54a] data-[state=active]:text-black"
            >
              <Users className="w-4 h-4 mr-2" />
              Subscribers
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <AnalyticsOverview
              canExport={isAdmin}
              onNavigate={(id) => {
                // The queue tiles are shortcuts into the moderation pages;
                // presets are a tab of the sample queue.
                if (id === "applications") {
                  router.push("/mod/applications");
                  return;
                }
                router.push("/mod/samples");
              }}
            />
          </TabsContent>

          <TabsContent value="subscribers">
            <SubscribersPanel />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
