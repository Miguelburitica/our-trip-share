"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";

const icons = {
  inicio: <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  gastos: (
    <>
      <path d="M8 6h13" />
      <path d="M8 12h13" />
      <path d="M8 18h13" />
      <path d="M3 6h.01" />
      <path d="M3 12h.01" />
      <path d="M3 18h.01" />
    </>
  ),
  cuentas: (
    <>
      <path d="M8 3 4 7l4 4" />
      <path d="M4 7h16" />
      <path d="m16 21 4-4-4-4" />
      <path d="M20 17H4" />
    </>
  ),
  viaje: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="m16.24 7.76-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z" />
    </>
  ),
};

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export function TabBar() {
  const pathname = usePathname();
  const { tripId } = useParams<{ tripId: string }>();
  const base = `/t/${tripId}`;
  const tabs = [
    { href: base, label: "Inicio", icon: icons.inicio },
    { href: `${base}/gastos`, label: "Gastos", icon: icons.gastos },
    { href: `${base}/cuentas`, label: "Cuentas", icon: icons.cuentas },
    { href: `${base}/viaje`, label: "Viaje", icon: icons.viaje },
  ];
  const isActive = (href: string) => (href === base ? pathname === base : pathname.startsWith(href));
  const tab = (t: (typeof tabs)[number]) => (
    <Link
      key={t.href}
      href={t.href}
      aria-label={t.label}
      aria-current={isActive(t.href) ? "page" : undefined}
      className={`flex size-12 items-center justify-center rounded-full ${
        isActive(t.href) ? "bg-ink-2 text-bg" : "text-nav-idle"
      }`}
    >
      <Icon>{t.icon}</Icon>
    </Link>
  );

  return (
    <nav
      aria-label="Secciones"
      className="fixed inset-x-0 bottom-[22px] z-20 mx-auto flex h-[68px] w-[calc(100%-32px)] max-w-[448px] items-center justify-around rounded-full bg-ink px-2.5"
    >
      {tabs.slice(0, 2).map(tab)}
      <Link
        href={`${base}/nuevo`}
        aria-label="Nuevo gasto"
        className="flex size-[52px] items-center justify-center rounded-full bg-accent text-white"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
          <path d="M5 12h14" />
          <path d="M12 5v14" />
        </svg>
      </Link>
      {tabs.slice(2).map(tab)}
    </nav>
  );
}
