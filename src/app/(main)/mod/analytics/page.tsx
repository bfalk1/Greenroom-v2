"use client";

import React, { useEffect, useState } from "react";
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
 *
 * This is the moderators' door specifically — admins are sent to their own
 * dashboard, which already mounts these panels alongside everything else.
 */
export default function ModAnalyticsPage() {
  const router = useRouter();
  const { user } = useUser();
  const [activeTab, setActiveTab] = useState("overview");

  // One door per role: admins read these panels in the admin dashboard, so
  // this route is for moderators. Wait for the role — it's null while loading.
  const isAdmin = user?.role === "ADMIN";
  useEffect(() => {
    if (isAdmin) router.replace("/admin/dashboard");
  }, [isAdmin, router]);

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
              // Never true in practice: an admin is redirected above. Kept
              // honest rather than hardcoded false, so the one-frame render
              // before the redirect doesn't lie about what this role can do.
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
