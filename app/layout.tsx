import type { Metadata } from "next";
import "./globals.css";
export const metadata:Metadata={title:"LeadGapScan | Find Where Your Website Is Losing Leads",description:"A free lead-conversion scan for local service businesses. Estimate inquiry gaps, understand the math, and get prioritized website fixes.",other:{"codex-preview":"development"},icons:{icon:"/favicon.svg",shortcut:"/favicon.svg"}};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en"><body>{children}</body></html>}
