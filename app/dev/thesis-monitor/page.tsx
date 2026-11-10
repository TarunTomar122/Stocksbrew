import { notFound } from "next/navigation";
import { ThesisMonitorDemo } from "@/components/dev/thesis-monitor-demo";

export default function ThesisMonitorDemoPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return <ThesisMonitorDemo />;
}
