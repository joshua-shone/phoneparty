import {
  players,
  listenForAllPlayers, stopListeningForAllPlayers,
  acceptAllPlayers, stopAcceptingPlayers,
  listenForLeavingPlayers, stopListeningForLeavingPlayers,
} from '/host/players.mjs';

const routes = {};
export default routes;

export async function startRouting({defaultRoute}) {

  let counter = 0;

  while (true) {

    const route = location.hash || defaultRoute;
    const routeCounter = counter++;

    // Send current route to all players
    function handlePlayer(player) {
      const message = route + '@' + routeCounter;
      if (player.routeChannel.readyState === 'open') {
        player.routeChannel.send(message);
      } else {
        player.routeChannel.onopen = () => {
          player.routeChannel.send(message)
        }
      }
    }
    listenForAllPlayers(handlePlayer);

    let hasRouteEnded = false;
    const routeEndListeners = new Set();

    function onHashChange() {
      if (location.hash !== route) {
        hasRouteEnded = true;
        routeEndListeners.forEach(callback => callback());
        routeEndListeners.clear();
        window.removeEventListener('hashchange', onHashChange);
      }
    }
    window.addEventListener('hashchange', onHashChange);

    const routeContext = {
      route: route,
      params: new URLSearchParams(route.split('?')[1]),

      waitForEnd: async () => {
        // Wait for the browser to be navigated to a different URL hash, or for the
        // the current route to be skipped by pressing spacebar.
        if (hasRouteEnded) return 'route-ended';
        return new Promise(resolve => routeEndListeners.add(() => resolve('route-ended')));
      },

      acceptAllPlayers: callback => {
        if (hasRouteEnded) throw 'Route has ended';
        acceptAllPlayers(callback);
        routeEndListeners.add(() => stopAcceptingPlayers());
      },

      listenForPlayers: callback => {
        if (hasRouteEnded) throw 'Route has ended';
        listenForAllPlayers(callback);
        routeEndListeners.add(() => stopListeningForAllPlayers(callback));
      },

      listenForLeavingPlayers: callback => {
        if (hasRouteEnded) throw 'Route has ended';
        listenForLeavingPlayers(callback);
        routeEndListeners.add(() => stopListeningForLeavingPlayers(callback));
      },

      createChannel: (player, label) => {
        let channelLabel = route + '@' + routeCounter;
        if (label) {
          channelLabel += '%' + label;
        }
        return player.rtcConnection.createDataChannel(channelLabel);
      },
    };

    // Call route handler
    const routeHandler = routes[route.split('?')[0]] || routeNotFoundScreen;
    const nextRouteFromHandler = await routeHandler(routeContext);

    window.removeEventListener('hashchange', onHashChange);

    hasRouteEnded = true;
    routeEndListeners.forEach(callback => callback());
    routeEndListeners.clear();

    // Stop sending current route to all players
    stopListeningForAllPlayers(handlePlayer);
    players.forEach(player => player.routeChannel.onopen = null);

    // Find the next route
    if ((location.hash || defaultRoute) === route) { // If the hash hasn't changed..
      if (nextRouteFromHandler) {
        // If the route handler has returned a new route (hash), go to that
        location.hash = nextRouteFromHandler;
      } else {
        // Otherwise, wait for the browser to be navigated to a new hash (route)
        await new Promise(resolve => window.addEventListener('hashchange', resolve, {once: true}));
      }
    }
  }
}

async function routeNotFoundScreen({route}) {
  document.body.style.backgroundColor = '#fff';
  document.body.insertAdjacentHTML('beforeend', `
    <div id="route-not-found">
      <h1>404</h1>
      <p>No handler found for route: <b class="route"></b></p>
    </div>
  `);
  const div = document.body.lastElementChild;
  div.querySelector('.route').textContent = route;

  await waitForRouteToEnd();
  div.remove();
}
