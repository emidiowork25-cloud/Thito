import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import { Logo } from './Logo';

interface NavItem {
  to: string;
  label: string;
  /** Hidden entirely when false — never render a link that leads to a 403. */
  visible: boolean;
  /** Count badge, for queues that need attention. */
  badge?: number;
}

export function Shell(): JSX.Element {
  const { user, isAdmin, can, signOut, siteName } = useSession();
  const navigate = useNavigate();
  const [pendingSignups, setPendingSignups] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  // The approvals badge is the one number an administrator needs without
  // opening the page, so it is polled rather than fetched once.
  useEffect(() => {
    if (!isAdmin) return;
    const load = (): void => {
      void api
        .signups('pending')
        .then((r) => setPendingSignups(r.pendingCount))
        .catch(() => undefined);
    };
    load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, [isAdmin]);

  const items: NavItem[] = [
    { to: '/app', label: 'Recepções', visible: true },
    { to: '/app/multiview', label: 'Multiview', visible: can('ingest.viewAll') },
    { to: '/app/dashboard', label: 'Banda', visible: true },
    { to: '/app/aprovacoes', label: 'Aprovações', visible: isAdmin, badge: pendingSignups },
    { to: '/app/usuarios', label: 'Usuários', visible: isAdmin },
    { to: '/app/destinos', label: 'Destinos', visible: isAdmin },
    { to: '/app/configuracoes', label: 'Configurações', visible: isAdmin },
  ];

  const leave = async (): Promise<void> => {
    await signOut();
    navigate('/', { replace: true });
  };

  const linkClass = ({ isActive }: { isActive: boolean }): string =>
    `rounded-lg px-3 py-1.5 font-display text-sm font-bold uppercase tracking-wide transition-colors ${
      isActive ? 'bg-sky text-ink-950' : 'text-mist hover:bg-ink-700 hover:text-paper'
    }`;

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-30 border-b border-ink-600 bg-ink-900/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
          <NavLink to="/app" className="shrink-0">
            <Logo siteName={siteName} />
          </NavLink>

          <nav className="order-3 flex w-full flex-wrap gap-1 lg:order-2 lg:w-auto lg:flex-1">
            {items
              .filter((item) => item.visible)
              .map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/app'}
                  className={linkClass}
                >
                  {item.label}
                  {item.badge ? (
                    <span className="ml-1.5 rounded-full bg-sky px-1.5 py-0.5 font-mono text-[10px] font-bold text-ink-950">
                      {item.badge}
                    </span>
                  ) : null}
                </NavLink>
              ))}
          </nav>

          <div className="order-2 ml-auto flex items-center gap-2 lg:order-3">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-ink-700"
              aria-expanded={menuOpen}
            >
              <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-sky to-teal font-display text-sm font-bold text-ink-950">
                {user?.displayName.slice(0, 2).toUpperCase()}
              </span>
              <span className="hidden text-sm sm:block">
                <span className="block leading-tight text-paper">{user?.displayName}</span>
                <span className="block font-display text-xs uppercase tracking-wide text-faint">
                  {isAdmin ? 'Administrador' : 'Operador'}
                </span>
              </span>
            </button>

            {menuOpen && (
              <div className="absolute right-4 top-16 z-40 w-52 overflow-hidden rounded-xl border border-ink-600 bg-ink-800 shadow-xl">
                <NavLink
                  to="/app/conta"
                  onClick={() => setMenuOpen(false)}
                  className="block px-4 py-3 text-sm hover:bg-ink-700"
                >
                  Minha conta
                </NavLink>
                <button
                  type="button"
                  onClick={() => void leave()}
                  className="block w-full border-t border-ink-600 px-4 py-3 text-left text-sm text-signal-fault hover:bg-ink-700"
                >
                  Sair
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6" onClick={() => setMenuOpen(false)}>
        <Outlet />
      </main>
    </div>
  );
}
