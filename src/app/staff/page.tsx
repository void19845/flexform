import type { Metadata } from "next";
import { StaffApp } from "@/components/staff/staff-app";

export const metadata: Metadata = {
  title: "Staff · Récompenses",
  robots: { index: false, follow: false },
};

export default function StaffPage() {
  return (
    <main className="page-staff">
      <StaffApp />
    </main>
  );
}
