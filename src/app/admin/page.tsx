import type { Metadata } from "next";
import { AdminApp } from "@/components/admin/admin-app";

export const metadata: Metadata = {
  title: "Admin · Sondages AG",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return (
    <div className="page-admin">
      <AdminApp />
    </div>
  );
}
