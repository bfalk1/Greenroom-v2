"use client";

import React from "react";
import { UserSearchPanel } from "@/components/admin/UserSearchPanel";

export default function AdminUsersPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            User Management
          </h1>
          <p className="text-[#a1a1a1]">
            Search and manage platform users
          </p>
        </div>

        <UserSearchPanel />
      </div>
    </div>
  );
}
