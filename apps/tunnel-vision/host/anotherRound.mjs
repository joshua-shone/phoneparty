import {players} from '/host/players.mjs';

import {waitForNSeconds} from '/common/utils.mjs';

import {addSpeechBubbleToPlayer} from '/host/messaging.mjs';

import routes from '/host/routes.mjs';

import * as audienceMode from '/host/audienceMode.mjs';

routes['#apps/tunnel-vision/another-round'] = async function anotherRound({waitForEnd, createChannel, listenForPlayers, listenForLeavingPlayers}) {
  document.body.style.backgroundColor = '#98947f';
  document.body.insertAdjacentHTML('beforeend', `
    <div class="tunnel-vision another-round-screen">
      <h1>Play another round?</h1>
    </div>
  `);
  const container = document.body.lastElementChild;

  audienceMode.start();

  const waitForAllPlayers = new Promise(resolve => {
    const confirmedPlayers = new Set();
    function checkIfAllPlayersConfirmed() {
      if (players.length > 0 && players.every(player => confirmedPlayers.has(player))) {
        resolve();
      }
    }
    listenForPlayers(player => {
      createChannel(player).onmessage = () => {
        confirmedPlayers.add(player);
        addSpeechBubbleToPlayer(player, '👍');
        checkIfAllPlayersConfirmed();
      }
    })
    listenForLeavingPlayers(checkIfAllPlayersConfirmed);
  });

  const result = await Promise.race([waitForAllPlayers, waitForEnd()]);
  if (result === 'route-ended') {
    container.remove();
    return;
  }

  // Highlight speech bubbles
  for (const player of players) {
    const speechBubble = player.querySelector('.speech-bubble:not(.cleared)');
    if (speechBubble) {
      speechBubble.classList.add('highlight');
    }
  }
  await waitForNSeconds(1.5);

  // Clear speech bubbles
  for (const player of players) {
    const speechBubble = player.querySelector('.speech-bubble:not(.cleared)');
    if (speechBubble) {
      speechBubble.classList.remove('highlight');
      speechBubble.classList.add('cleared');
      setTimeout(() => speechBubble.remove(), 500);
    }
  }
  await waitForNSeconds(0.5);

  container.remove();

  return '#apps/tunnel-vision/thing-choosing';
}
