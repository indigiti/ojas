import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "OJAS — Strength Training Log", description: "Plan, log and review strength workouts." };
export default function Layout({children}: {children: React.ReactNode}) {
  return <html lang="en"><body>{children}</body></html>;
}