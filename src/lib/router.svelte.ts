export type Route =
  | { name: 'library' }
  | { name: 'game'; slug: string }
  | { name: 'settings' }
  | { name: 'not-found'; path: string };

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#\/?/, '');
  if (path === '') return { name: 'library' };
  if (path === 'settings') return { name: 'settings' };

  const gameMatch = /^game\/([^/]+)$/.exec(path);
  if (gameMatch) {
    try {
      return { name: 'game', slug: decodeURIComponent(gameMatch[1]) };
    } catch {
      return { name: 'not-found', path };
    }
  }

  return { name: 'not-found', path };
}

function currentRoute(): Route {
  if (typeof window === 'undefined') return { name: 'library' };
  return parseRoute(window.location.hash);
}

class Router {
  route = $state<Route>(currentRoute());

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('hashchange', () => {
        this.route = currentRoute();
      });
    }
  }

  navigate(path: string): void {
    if (typeof window === 'undefined') return;
    const next = path.startsWith('#') ? path : `#${path}`;
    if (window.location.hash === next) {
      this.route = currentRoute();
      return;
    }
    window.location.hash = next;
  }

  back(): void {
    if (typeof window === 'undefined') return;
    if (window.history.length > 1) window.history.back();
    else this.navigate('/');
  }
}

export const router = new Router();
