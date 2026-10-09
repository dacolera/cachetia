export type Route =
  | { name: 'home' }
  | { name: 'new' }
  | { name: 'match'; id: string }
  | { name: 'history' }
  | { name: 'detail'; id: string }
  | { name: 'ranking' }
  | { name: 'players' };

export type Navigate = (route: Route) => void;
