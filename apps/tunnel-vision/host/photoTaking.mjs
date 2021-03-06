import {waitForNSeconds} from '/common/utils.mjs';

import {
  players,
  stopAcceptingPlayers,
  listenForLeavingPlayers,
  stopListeningForLeavingPlayers
} from '/host/players.mjs';

import * as playerGrid from './playerGrid.mjs';
import * as audienceMode from '/host/audienceMode.mjs';

import routes from '/host/routes.mjs';

import {
  playerPhotos,
  getNextPhotoId,
  routesWithPlayerGrid,
  setupCurrentThingIndicator,
  currentThingIndicatorRouteEnd
} from './tunnel-vision.mjs';

routes['#apps/tunnel-vision/photo-taking'] = async function photoTaking({params, acceptAllPlayers, createChannel, listenForLeavingPlayers}) {
  document.body.style.backgroundColor = '#98947f';

  const chosenThingElement = setupCurrentThingIndicator(params);

  const shutterSound        = new Audio('/apps/tunnel-vision/sounds/camera-shutter.wav');
  const allPhotosTakenSound = new Audio('/apps/tunnel-vision/sounds/all-photos-taken.mp3');

  audienceMode.stop();

  await waitForNSeconds(1);

  // Clear any photos from previous rounds of the game
  while (playerPhotos.length > 0) {
    playerPhotos.pop();
  }

  // Layout players as a grid of bubbles
  acceptAllPlayers(player => {
    player.classList.add('bubble', 'moving-to-grid');
    if (!player.parentElement) {
      document.body.appendChild(player);
    }
  });
  playerGrid.start();
  await waitForNSeconds(2.5);
  stopAcceptingPlayers();

  // Hide players, as they will transition into phones next
  players.forEach(player => player.classList.add('scale-down'));
  await waitForNSeconds(0.5);
  players.forEach(player => player.classList.remove('scale-down', 'bubble'));

  document.body.insertAdjacentHTML('beforeend', `
    <div class="tunnel-vision photo-taking-screen">
      <h1>Take your photos!</h1>
    </div>
  `);
  const photoTakingScreen = document.body.lastElementChild;

  // Wait for every player to take a photo
  await new Promise(resolve => {
    const timers = [];
    function checkIfAllPhotosTaken() {
      if (players.length >= 2 && players.every(player => playerPhotos.find(photo => photo.player === player))) {
        stopAcceptingPlayers();
        stopListeningForLeavingPlayers(checkIfAllPhotosTaken);
        while (timers.length > 0) clearTimeout(timers.pop());
        resolve();
      }
    }
    acceptAllPlayers(player => {
      player.classList.add('taking-photo', 'moving-to-grid');
      player.insertAdjacentHTML('beforeend', `
        <div class="tunnel-vision phone">
          <div class="phone-background"></div>
          <div class="phone-switched-off-black"></div>
          <div class="phone-foreground"></div>
        </div>
      `);
      if (!player.parentElement) {
        document.body.appendChild(player);
      }
      timers.push(setTimeout(() => player.classList.add('video-not-visible'), 15000));
      createChannel(player).onmessage = async function(event) {
        shutterSound.play().catch(() => {});
        acceptPhotoFromPlayer(player, event.data);
        checkIfAllPhotosTaken();
      }
    });
    listenForLeavingPlayers(checkIfAllPhotosTaken);
  });
  photoTakingScreen.querySelector('h1').textContent = 'All photos taken';
  allPhotosTakenSound.play().catch(() => {});
  document.body.classList.add('tunnel-vision_all-photos-taken');
  await waitForNSeconds(0.5);
  document.body.classList.remove('tunnel-vision_all-photos-taken');

  await waitForNSeconds(2);

  // Highlight all photos
  const highlightDurationSecs = 0.4;
  players.forEach((player, index) => {
    const photo = playerPhotos.find(photo => photo.player === player);
    photo.photoContainer.style.animationDelay = `${highlightDurationSecs * (index / (players.length-1))}s`;
    photo.photoContainer.classList.add('all-photos-taken-highlight');
  });
  await waitForNSeconds(1);
  for (const photo of playerPhotos) {
    photo.photoContainer.style.animationDelay = '';
    photo.photoContainer.classList.remove('all-photos-taken-highlight');
  }

  // Clean up
  photoTakingScreen.remove();
  players.forEach(player => player.classList.remove('video-not-visible'));

  if (!routesWithPlayerGrid.has(location.hash.split('?')[0])) {
    playerGrid.stop();
  }

  currentThingIndicatorRouteEnd();

  return `#apps/tunnel-vision/present-photos?thing=${chosenThingElement.dataset.name}`;
}

function acceptPhotoFromPlayer(player, photoArrayBuffer) {
  const photoBlob = new Blob([photoArrayBuffer], {type: 'image/jpeg'});
  const photoUrl = URL.createObjectURL(photoBlob);

  document.body.insertAdjacentHTML('beforeend', `
    <div class="tunnel-vision photo-container">
      <div class="crop-container">
        <img src="${photoUrl}">
      </div>
    </div>
  `);
  const photoContainer = document.body.lastElementChild;
  photoContainer.player = player;
  photoContainer.arrayBuffer = photoArrayBuffer;

  playerPhotos.push({player, photoContainer, id: getNextPhotoId()});

  player.classList.add('photo-taken', 'camera-shutter');
  setTimeout(() => player.classList.remove('camera-shutter'), 200);

  playerGrid.updateLayout();

  setTimeout(() => {
    player.remove();
    player.classList.remove('moving-to-grid', 'taking-photo', 'photo-taken');
    player.style.width  = '';
    player.style.height = '';
    player.querySelector('.phone').remove();
  }, 1000);

  listenForLeavingPlayers(function callback(leavingPlayer) {
    if (leavingPlayer === player) {
      photoContainer.remove();
      const playerPhoto = playerPhotos.find(photo => photo.player === player);
      if (playerPhoto) {
        playerPhoto.player = null;
        playerPhoto.photoContainer = null;
        playerPhoto.id = null;
      }
      stopListeningForLeavingPlayers(callback);
    }
  });
}
