import type { ReactNode } from 'react';
import type { Me } from '../../../shared/types';
import { Link } from '../components';
import { Icon, type IconName } from './icons';

export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
}

export const NAV: readonly NavItem[] = [
  { to: '/', label: 'Dashboard', icon: 'grid' },
  { to: '/videos', label: 'Videos', icon: 'film' },
  { to: '/library', label: 'Library', icon: 'folder' },
  { to: '/workers', label: 'Workers', icon: 'cpu' },
];

export function isCurrent(path: string, to: string): boolean {
  return to === '/' ? path === '/' : path === to || path.startsWith(`${to}/`);
}

function Brand() {
  return (
    <Link to="/" className="brand">
      <span className="brand-mark" aria-hidden="true">
        VP
      </span>
      Video pipeline
    </Link>
  );
}

function NavLinks({ path, items }: { path: string; items: readonly NavItem[] }) {
  return (
    <>
      {items.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          className={isCurrent(path, item.to) ? 'nav-link nav-current' : 'nav-link'}
        >
          <Icon name={item.icon} />
          {item.label}
        </Link>
      ))}
    </>
  );
}

/**
 * The frame around every page: a sidebar from 48rem up, a top bar and a bottom tab bar below
 * that. Both hold the same links, so the page reads the same on a phone and a desk.
 */
export function Shell({
  path,
  me,
  onSignOut,
  children,
}: {
  path: string;
  me: Me;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const signOut = (
    <button type="button" className="text-button" onClick={onSignOut}>
      Sign out
    </button>
  );
  return (
    <div className="app">
      <a className="skip" href="#content">
        Skip to content
      </a>
      <header className="topbar">
        <Brand />
        <span className="who">
          <span className="who-name">{me.name}</span>
          {signOut}
        </span>
      </header>
      <aside className="sidebar">
        <Brand />
        <nav aria-label="Main">
          <NavLinks path={path} items={NAV} />
        </nav>
        <Link to="/videos/new" className="primary-link">
          <Icon name="plus" />
          New video
        </Link>
        <div className="sidebar-foot">
          <span className="who-name">{me.name}</span>
          {signOut}
        </div>
      </aside>
      <main id="content" className="content">
        {children}
      </main>
      <nav className="tabbar" aria-label="Pages">
        <NavLinks path={path} items={NAV} />
        <Link
          to="/videos/new"
          className={path === '/videos/new' ? 'nav-link nav-current' : 'nav-link'}
        >
          <Icon name="plus" />
          New
        </Link>
      </nav>
    </div>
  );
}
