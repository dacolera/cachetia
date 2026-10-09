import { useState } from 'react';
import type { Route } from './nav';
import { Cash } from './screens/Cash';
import { History, MatchDetail } from './screens/History';
import { Home } from './screens/Home';
import { MatchScreen } from './screens/MatchScreen';
import { NewMatch } from './screens/NewMatch';
import { Players } from './screens/Players';
import { Ranking } from './screens/Ranking';
import { UpdateBanner } from './components/UpdateBanner';
import type { Navigate } from './nav';
import { useStore } from './store';

export function App() {
  const { loaded } = useStore();
  const [route, setRoute] = useState<Route>({ name: 'home' });
  const go = (r: Route) => {
    setRoute(r);
    window.scrollTo(0, 0);
  };

  if (!loaded) return null;

  return (
    <>
      <Screen route={route} go={go} />
      <UpdateBanner />
    </>
  );
}

function Screen({ route, go }: { route: Route; go: Navigate }) {
  switch (route.name) {
    case 'home':
      return <Home go={go} />;
    case 'new':
      return <NewMatch go={go} />;
    case 'match':
      return <MatchScreen key={route.id} go={go} id={route.id} />;
    case 'history':
      return <History go={go} />;
    case 'detail':
      return <MatchDetail go={go} id={route.id} />;
    case 'ranking':
      return <Ranking go={go} />;
    case 'players':
      return <Players go={go} />;
    case 'cash':
      return <Cash go={go} />;
  }
}
