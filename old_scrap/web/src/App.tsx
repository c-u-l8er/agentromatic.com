import React, { useEffect, useMemo, useState } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import AppConvex from "./AppConvex";
import WorkflowVisualEditorPage from "./workflow/WorkflowVisualEditorPage";

function usePathname(): string {
  const [pathname, setPathname] = useState<string>(
    () => window.location.pathname,
  );

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  return pathname;
}

function matchWorkflowVisualRoute(
  pathname: string,
): { workflowId: string } | null {
  const m = pathname.match(/^\/workflows\/([^/]+)\/visual\/?$/);
  if (!m) return null;
  return { workflowId: m[1] };
}

export default function App(): React.ReactElement {
  const pathname = usePathname();

  const visualMatch = useMemo(
    () => matchWorkflowVisualRoute(pathname),
    [pathname],
  );

  if (visualMatch) {
    return (
      <WorkflowVisualEditorPage
        workflowId={visualMatch.workflowId as Id<"workflows">}
      />
    );
  }

  return <AppConvex />;
}
