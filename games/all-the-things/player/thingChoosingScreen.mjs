import routes, {waitForRouteChange, listenForChannelOnCurrentRoute} from '/routes.mjs';
import {waitForNSeconds} from '/shared/utils.mjs';

routes['#games/all-the-things/thing-choosing'] = async function thingChoosingScreen() {
  document.body.style.backgroundColor = '#98947f';

  const subjectPanel = document.getElementById('subject-panel');
  subjectPanel.insertAdjacentHTML('beforeend', `
    <div class="all-the-things thing-choosing-screen active">
      <h1>Choosing thing...</h1>
      <div class="thinking-emoji"></div>
    </div>
  `);
  const thingChoosingScreen = subjectPanel.lastElementChild;

  listenForChannelOnCurrentRoute(channel => {
    channel.onmessage = () => {
      thingChoosingScreen.querySelector('h1').remove();
      thingChoosingScreen.querySelector('.thinking-emoji').remove();
      const thingName = event.data;
      thingChoosingScreen.insertAdjacentHTML('beforeend', `
        <div class="thing">
          <img src="/games/all-the-things/things/${thingName}.svg">
          <label>${thingName}</label>
        </div>
      `);
    }
  });

  await waitForRouteChange();

//   thingChoosingScreen.classList.remove('active');
//   await waitForNSeconds(0.5);

  thingChoosingScreen.remove();
}
