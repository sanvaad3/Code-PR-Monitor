"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Sidebar() {
  const pathname = usePathname();

  const navItems = [
    {
      name: "Reviews",
      href: "/reviews",
      icon: (
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      ),
    },
  ];

  return (
    <aside className="fixed top-0 left-0 z-40 w-64 h-screen bg-[var(--sidebar-bg)] border-r border-[var(--sidebar-border)]">
      <div className="h-full px-3 py-4 overflow-y-auto">
        <div className="mb-8 px-3">
          <h1 className="text-xl font-bold text-white">BroCode</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Intelligent code review
          </p>
        </div>

        <nav className="space-y-2">
          <div className="mb-4">
            <ul className="space-y-1">
              {navItems.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/" && pathname.startsWith(item.href));
                return (
                  <li key={item.name}>
                    <Link
                      href={item.href}
                      className={`flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-colors bg-blue-50 dark:bg-blue-900/20 text-white dark:text-blue-400"}`}
                    >
                      <span className={"text-white dark:text-white"}>
                        {item.icon}
                      </span>
                      <span className="ml-3">{item.name}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </nav>

        <div className="absolute bottom-4 left-0 right-0 px-6">
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <p className="text-xs text-blue-800 dark:text-blue-300 font-medium">
              Phase 8: Dashboard
            </p>
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
              Development in progress
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
