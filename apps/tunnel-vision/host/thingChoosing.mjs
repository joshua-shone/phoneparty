import {
  waitForNSeconds,
  waitForKeypress,
  randomInArray
} from '/common/utils.mjs';

import routes from '/host/routes.mjs';

import {currentThingIndicatorRouteEnd} from './tunnel-vision.mjs';

import * as audienceMode from '/host/audienceMode.mjs';
import * as messaging    from '/host/messaging.mjs';

routes['#apps/tunnel-vision/thing-choosing'] = async function thingChoosing({createChannel, listenForPlayers}) {
  document.body.style.backgroundColor = '#98947f';

  const container = document.createElement('div');
  container.attachShadow({mode: 'open'}).innerHTML = `
    <link rel="stylesheet" href="/apps/tunnel-vision/host/thingChoosing.css">
    <h1>Choosing thing...</h1>
    <div class="timer">
      <div class="pie-slice pie-slice1 hide"></div>
      <div class="pie-slice pie-slice2 hide"></div>
      <div class="pie-slice pie-slice3 hide"></div>
      <div class="pie-slice pie-slice4 hide"></div>
      <div class="pie-slice pie-slice5 hide"></div>
      <div class="pie-slice pie-slice6 hide"></div>
      <div class="pie-slice pie-slice7 hide"></div>
      <div class="pie-slice pie-slice8 hide"></div>
      <div class="thinking-emoji"></div>
    </div>
  `;
  document.body.append(container);

  const existingThingIndicator = document.querySelector('.tunnel-vision.thing.show-in-top-right');
  if (existingThingIndicator) {
    existingThingIndicator.remove();
  }

  audienceMode.start();
  messaging.start();

  await waitForNSeconds(0.5);

  const thinkingEmoji = container.shadowRoot.querySelector('.thinking-emoji');
  thinkingEmoji.classList.add('appear');

  await Promise.race([waitForNSeconds(1), waitForKeypress(' ')]);

  const thingNames = ['bag', 'wallet', 'nose', 'toe', 'sock', 'food']; // 'person', 'underwear', 'key', 'shirt', 'pants'
  const thingElements = thingNames.map(thingName => {
    document.body.insertAdjacentHTML('beforeend', `
      <div class="tunnel-vision thing" data-name="${thingName}">
        <img src="/apps/tunnel-vision/things/${thingName}.svg">
      </div>
    `);
    return document.body.lastElementChild;
  });

  const stopJuggling = juggleElements(thingElements);

  await Promise.race([waitForNSeconds(3), waitForKeypress(' ')]);

  await countdownPieTimer(container.shadowRoot.querySelector('.timer'), 5);
  // TODO: cleanup and return if route changes during countdown

  stopJuggling();

  const chosenThingElement = getClosestThingToCenterOfScreen(thingElements);
  chosenThingElement.classList.add('chosen');

  // Send thing name to all players
  listenForPlayers(player => {
    createChannel(player).onopen = event => event.target.send(chosenThingElement.dataset.name);
  });

  await Promise.race([waitForNSeconds(1), waitForKeypress(' ')]);

  container.classList.add('fade-out');
  setTimeout(() => container.remove(), 1000);

  for (const thingElement of thingElements) {
    if (thingElement !== chosenThingElement) {
      thingElement.remove();
    }
  }

  chosenThingElement.classList.add('present-in-center');

  const thingLabel = document.createElement('label');
  thingLabel.classList.add('thing-label');
  thingLabel.textContent = chosenThingElement.dataset.name;
  chosenThingElement.appendChild(thingLabel);

  await Promise.race([waitForNSeconds(2), waitForKeypress(' ')]);

  chosenThingElement.classList.remove('chosen');
  chosenThingElement.classList.add('show-in-top-right');
  chosenThingElement.classList.remove('present-in-center');

  currentThingIndicatorRouteEnd();

  messaging.stop();

  return `#apps/tunnel-vision/goal?thing=${chosenThingElement.dataset.name}`;
}

export function chooseThing(thingName) {
  const element = document.createElement('div');
  element.classList.add('thing');
  element.dataset.name = thingName;
  const img = document.createElement('img');
  img.src = `/apps/tunnel-vision/things/${thingName}.svg`;
  element.appendChild(img);
  element.classList.add('show-in-top-right');
  document.body.appendChild(element);
  return element;
}

function juggleElements(elements) {
  for (const element of elements) {
    element.momentum = {x: 0, y: 0};
    element.position = {x: Math.random() * 100, y: -15};
    element.style.transform = `translate(${element.position.x}vw, ${element.position.y}vh)`;
  }
  let lastTimestamp = performance.now();
  let frameId = window.requestAnimationFrame(function callback(timestamp) {
    const delta = timestamp - lastTimestamp;
    lastTimestamp = timestamp;

    const gravity = 0.00012;
    const floorY = -15;

    for (const element of elements) {
      element.momentum.y -= gravity * delta;
      element.position.x += element.momentum.x * delta;
      element.position.y += element.momentum.y * delta;
      if (element.position.y < floorY) {
        element.position.y = floorY;
        element.momentum.y = 0;
      }
      if (element.position.x < 0) {
        element.position.x = 0;
        element.momentum.x = -element.momentum.x;
      } else if (element.position.x > 95) {
        element.position.x = 95;
        element.momentum.x = -element.momentum.x;
      }
      element.style.transform = `translate(${element.position.x}vw, ${100 - element.position.y}vh)`;
    }

    frameId = window.requestAnimationFrame(callback);
  });

  const throwInterval = setInterval(() => {
    const element = randomInArray(elements.filter(element => element.position.y < 0));
    if (element) {
      element.momentum.x = (Math.random() - 0.5) * 0.02;
      element.momentum.y = 0.1 + (Math.random() * 0.06);
    }
  }, 1000);

  return function stopJuggling() {
    clearInterval(throwInterval);
    window.cancelAnimationFrame(frameId);
  }
}

async function countdownPieTimer(timerElement, seconds) {
  let currentPieSlice = 1;
  while (currentPieSlice <= 8) {
    const result = await Promise.race([waitForNSeconds(seconds / 8), waitForKeypress(' ')]);
    if (result && result.type === 'keypress') {
      break;
    }
    timerElement.querySelector(`.pie-slice${currentPieSlice}`).classList.remove('hide');
    currentPieSlice++;
  }

  for (const slice of timerElement.getElementsByClassName('pie-slice')) {
    slice.classList.remove('hide');
  }
}

function getClosestThingToCenterOfScreen(thingElements) {
  let closestThing = null;
  let closestThingDistance = null;
  for (const thingElement of thingElements) {
    const deltaX = thingElement.position.x - 50;
    const deltaY = thingElement.position.y - 50;
    const distance = (deltaX*deltaX) + (deltaY*deltaY);
    if (!closestThingDistance || (distance < closestThingDistance)) {
      closestThingDistance = distance;
      closestThing = thingElement;
    }
  }
  return closestThing;
}
