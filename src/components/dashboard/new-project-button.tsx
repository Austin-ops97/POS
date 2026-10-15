"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FolderKanban } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ProjectCreateDialog } from "@/components/office/apps/project-create-dialog";
import type { EmployeeOption } from "@/components/office/apps/record-client";
import type { OfficeWorkspaceRecordSummary } from "@/lib/office/workspace-service";

export function NewProjectButton({ employees }: { employees: EmployeeOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  function onCreated(record: OfficeWorkspaceRecordSummary) {
    toast.success("Project created");
    router.push(`/office/apps/projects?project=${record.id}`);
    router.refresh();
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <FolderKanban className="h-4 w-4" />
        New Project
      </Button>
      <ProjectCreateDialog open={open} onOpenChange={setOpen} employees={employees} onCreated={onCreated} />
    </>
  );
}
