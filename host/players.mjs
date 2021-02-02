import {
  waitForRtcClose,
  setupKeepaliveChannel
} from '/common/utils.mjs';

export const players = [];

const listenForNewPlayersCallbacks = [];
export function listenForNewPlayers(callback) {
  if (!listenForNewPlayersCallbacks.includes(callback)) {
    listenForNewPlayersCallbacks.push(callback);
  }
}
export function stopListeningForNewPlayers(callback) {
  const index = listenForNewPlayersCallbacks.indexOf(callback);
  if (index !== -1) {
    listenForNewPlayersCallbacks.splice(index, 1);
  }
}

const listenForAllPlayersCallbacks = [];
export function listenForAllPlayers(callback) {
  for (const player of players) {
    callback(player);
  }
  if (!listenForAllPlayersCallbacks.includes(callback)) {
    listenForAllPlayersCallbacks.push(callback);
  }
}
export function stopListeningForAllPlayers(callback) {
  const index = listenForAllPlayersCallbacks.indexOf(callback);
  if (index !== -1) {
    listenForAllPlayersCallbacks.splice(index, 1);
  }
}

const leavingPlayerCallbacks = new Set();
export function listenForLeavingPlayers(callback) {
  leavingPlayerCallbacks.add(callback);
}
export function stopListeningForLeavingPlayers(callback) {
  leavingPlayerCallbacks.delete(callback);
}

export async function waitForPlayerToLeave(player) {
  if (players.indexOf(player) === -1) {
    return 'player_left';
  } else {
    return new Promise(resolve => {
      listenForLeavingPlayers(function handlePlayerLeaving(p) {
        if (p === player) {
          resolve('player_left');
          stopListeningForLeavingPlayers(handlePlayerLeaving);
        }
      });
    });
  }
}

const newPlayerSound  = new Audio('/sounds/new_player.mp3');
const playerLeftSound = new Audio('/sounds/player_left.mp3');

export async function handleNewPlayer(playerId, sdp, websocket) {
  const player = document.createElement('div');

  player.playerId = playerId;

  const rtcConnection = new RTCPeerConnection();
  let hasSentSdp = false;
  const iceCandidatesToSend = [];
  rtcConnection.onicecandidate = event => {
    if (event.candidate) {
      iceCandidatesToSend.push(event.candidate.toJSON());
      if (hasSentSdp) {
        while (iceCandidatesToSend.length) websocket.send(JSON.stringify({playerId: playerId, iceCandidate: iceCandidatesToSend.pop()}));
      }
    }
  }

  function onWebsocketMessage({data}) {
    const message = JSON.parse(data);
    if (message.playerId === playerId) {
      if (message.connectionState === 'disconnected') {
        websocket.removeEventListener('message', onWebsocketMessage);
      } else if (message.iceCandidate) {
        rtcConnection.addIceCandidate(message.iceCandidate);
      }
    }
  }
  websocket.addEventListener('message', onWebsocketMessage);

  await rtcConnection.setRemoteDescription({type: 'offer', sdp: sdp});

  const keepaliveChannel        = rtcConnection.createDataChannel('keepalive',       {negotiated: true, id: 7, ordered: false});
  const waitForKeepaliveEnd = setupKeepaliveChannel(keepaliveChannel);

  const accelerometerChannel    = rtcConnection.createDataChannel('accelerometer',   {negotiated: true, id: 3, ordered: false, maxRetransmits: 0});
  const visibilityChannel       = rtcConnection.createDataChannel('visibility',      {negotiated: true, id: 5, ordered: true});

  player.routeChannel           = rtcConnection.createDataChannel('route',           {negotiated: true, id: 9, ordered: true});

  const answer = await rtcConnection.createAnswer();
  rtcConnection.setLocalDescription(answer);
  websocket.send(JSON.stringify({playerId: playerId, sdp: answer.sdp}));
  hasSentSdp = true;
  while (iceCandidatesToSend.length) websocket.send(JSON.stringify({playerId: playerId, iceCandidate: iceCandidatesToSend.pop()}));

  // Wait for RTC to connect
  await new Promise((resolve, reject) => {
    rtcConnection.oniceconnectionstatechange = () => {
      if (rtcConnection.iceConnectionState === 'connected') {
        resolve();
      } else if (rtcConnection.iceConnectionState === 'failed') {
        reject();
      }
    }
  });

  player.rtcConnection = rtcConnection;

  player.wigglePosition = {x: 0, y: 0};
//   player.acceleration   = {x: 0, y: 0};
  player.wiggleMomentum = {x: 0, y: 0};
  accelerometerChannel.onmessage = event => {
    if (player.classList.contains('wiggleable')) {
      const acceleration = JSON.parse(event.data);
      player.wiggleMomentum.x += acceleration.x;
      player.wiggleMomentum.y -= acceleration.y;
//       const wiggle = 0.5;
//       player.wiggleMomentum.x += acceleration.x;
//       player.wiggleMomentum.y += acceleration.y;
    }
  }
  accelerometerChannel.onopen = () => {
    let timeOnLastWiggleUpdate = performance.now();
    const wiggliness = 0.002;
    const antiWiggliness = 0.02;
    window.requestAnimationFrame(function callback(timestamp) {
      if (player.classList.contains('wiggleable')) {
        const delta = timestamp - timeOnLastWiggleUpdate;
        player.wigglePosition.x += player.wiggleMomentum.x * delta * wiggliness;
        player.wigglePosition.y += player.wiggleMomentum.y * delta * wiggliness;

        player.wiggleMomentum.x -= player.wigglePosition.x * delta * antiWiggliness * 2;
        player.wiggleMomentum.y -= player.wigglePosition.y * delta * antiWiggliness * 2;

        player.wiggleMomentum.x *= Math.max(0, 1 - (delta * antiWiggliness));
        player.wiggleMomentum.y *= Math.max(0, 1 - (delta * antiWiggliness));

        player.style.transform = `translate(${(player.wigglePosition.x) + 'vw'}, ${(player.wigglePosition.y) + 'vw'})`;
        timeOnLastWiggleUpdate = timestamp;
      }
      if (accelerometerChannel.readyState === 'open') {
        window.requestAnimationFrame(callback);
      }
    });
  }

  visibilityChannel.onmessage = event => player.dataset.visibility = event.data;

  player.classList.add('player', 'new');
  setTimeout(() => player.classList.remove('new'), 500);

  players.push(player);

  for (const callback of listenForAllPlayersCallbacks) {
    callback(player);
  }
  for (const callback of listenForNewPlayersCallbacks) {
    callback(player);
  }

  newPlayerSound.play().catch(() => {});

  const waitForPlayerKicked = new Promise(resolve => {
    player.addEventListener('contextmenu', event => {
      resolve();
      event.preventDefault();
    }, {once: true});
  });

  await Promise.race([waitForRtcClose(rtcConnection), waitForKeepaliveEnd, waitForPlayerKicked]);

  keepaliveChannel.close();
  rtcConnection.close();

  websocket.removeEventListener('message', onWebsocketMessage);

  playerLeftSound.play().catch(() => {});

  player.classList.remove('new');
  player.classList.add('leaving');
  player.dataset.visibility = '';
  setTimeout(() => player.remove(), 200);
  players.splice(players.indexOf(player), 1);

  for (const callback of leavingPlayerCallbacks) {
    callback(player);
  }
}
