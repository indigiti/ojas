import type { Metadata } from "next";
import "./globals.css";
import { RegisterWorker } from "@/components/register-worker";
const base=process.env.NEXT_PUBLIC_BASE_PATH||"";
export const metadata: Metadata = { title: "OJAS — Strength Training Log", description: "Plan, log and review strength workouts.", manifest: base+"/manifest.webmanifest" };
export default function Layout({children}: {children: React.ReactNode}) {
  return <html lang="en"><body>{children}<RegisterWorker/></body></html>;
}