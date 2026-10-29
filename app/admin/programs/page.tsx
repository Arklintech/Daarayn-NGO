"use client";

import ProgramsManager from "@/components/admin/ProgramsManager";

export default function AdminPrograms() {
  return (
    <div className="space-y-6 pb-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white font-playfair">Programs</h1>
        <p className="mt-2 text-gray-400 text-sm max-w-3xl leading-relaxed">
          One place to manage programs, campaigns and causes. Each entry has a permanent id that is also its donation cause id: donations, designations, allocations, CRM and communications all refer to it. Only published entries (Published or Urgent) appear on the public website and in the donation form; Draft, Completed and Unpublished entries keep every record and donation.
        </p>
      </div>
      <ProgramsManager />
    </div>
  );
}
