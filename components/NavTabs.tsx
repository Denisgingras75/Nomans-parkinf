"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Persistent top nav so you can hop between the three views from anywhere.
// /driver and /admin are still passcode-gated — these links just navigate
// there; the gate does the rest.
const TABS = [
  { href: "/", label: "Passenger" },
  { href: "/driver", label: "Driver" },
  { href: "/admin", label: "Admin" },
] as const;

export default function NavTabs() {
  const pathname = usePathname() || "/";
  return (
    <nav className="nav-tabs" aria-label="Switch view">
      {TABS.map((t) => {
        const active = t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} className={active ? "active" : ""}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
