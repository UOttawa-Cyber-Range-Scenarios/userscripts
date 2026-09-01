// ==UserScript==
// @name        CITEF Controller
// @namespace   uOttawa-IBM Cyber Range script
// @match       https://citef.griseo.ca/*
// @match       https://auth-citef.griseo.ca/realms/citef_realm/protocol/openid-connect/auth
// @grant       none
// @version     1.22
// @author      Julien Cassagne, Sarra Sassi
// @description Automate CITEF interface on CR iMacs
// @homepage https://github.com/UOttawa-Cyber-Range-Scenarios/userscripts
// @downloadURL https://github.com/UOttawa-Cyber-Range-Scenarios/userscripts/raw/refs/heads/main/citefcontroller.user.js
// ==/UserScript==

var currentInterval = null;
const routeHandlers = {
  '/realms/citef_realm/protocol/openid-connect/auth': handlerLogin,
  '/ui/home': handlerRedirectScenario,
  '/': handlerRedirectScenario,
  '/ui/scenario-guacamole': handlerScenarioVnc,
  '/ui/scenario': handlerScenario,
};

async function CITEFController() {
  if (currentInterval !== null) {
    clearInterval(currentInterval);
  }
  await new Promise(resolve => setTimeout(resolve, 1000)); // wait util js gets executed

  const route = window.location.pathname || undefined;
  console.info(`CITEFController: Starting on ${route}`);

  const handler = routeHandlers[route];
  if (handler) {
    await handler();
  } else {
    console.debug(`CITEFController: No function defined for ${route}`);
  }
}

async function handlerLogin() {
  const checkLogin = async () => {
    await new Promise(resolve => setTimeout(resolve, 2000));
    const form = document.querySelector('form[action*="login-actions/authenticate"]');
    const username = form.querySelector('input[name="username"]');
    const password = form.querySelector('input[type="password"]');
    const submitButton = form.querySelector('[name="login"], button[type="submit"], input[type="submit"]');
    submitButton.removeAttribute('disabled');

    if (username.value == "" || password.value == "") {
      console.warn("CITEFController-handlerLogin: Missing username / password");
      return;
    }
    submitButton.click();
  }
  document.querySelector('form[action*="login-actions/authenticate"]').querySelector('input[type="password"]').addEventListener('change', checkLogin);
  currentInterval = setInterval(checkLogin, 30000);
  await checkLogin();
}

async function handlerRedirectScenario() {
  location.href = '/ui/scenario';
}

async function handlerScenario() {
  const checkScenario = async () => {
    // List accessible scenarios
    const created = await fetch("/api/scenario/search?page=0&size=100&caseSensitive=false&sortField=created&sortDirection=DESC");
    const createdJson = await created.json();
    const scenarioData = createdJson.content.filter(item => item.status === "INSTANTIATION");
    if (!scenarioData) { // no scenario instantiated
      return;
    }

    // Check status of instantiated scenarios
    let scenarioId = null;
    for (let item of scenarioData) {
      const exerciseRunning = await isExerciseRunning(item.id);
      const scenarioInstantiated = await isScenarioInstantiated(item.id);
      if (exerciseRunning && scenarioInstantiated) {
        scenarioId = item.id;
        break;
      }
    }
    if (!scenarioId) { // No scenario ready
      return;
    }

    // Fetch VM ID to build vnc url
    const nodeInstancesResponse = await fetch(`/api/scenario_template/nodes_instances/${scenarioId}`, {
      method: "GET",
    });
    const nodeInstances = await nodeInstancesResponse.json();
    const nodeInstanceId = Object.keys(nodeInstances).map(key => Object.keys(nodeInstances[key])[0])[0];
    if (!nodeInstanceId) {
      console.warn("CITEFController-handlerScenario: No node instance ID found");
      return;
    }
    window.location.href = `/ui/scenario-guacamole/${scenarioId}/${nodeInstanceId}/VNC`;
  }
  currentInterval = setInterval(checkScenario, 30000);
  await checkScenario();
}

async function handlerScenarioVnc() {
  // Remove the side padding from the fullscreened window
  /*try {
    document.getElementsByClassName('vncConsoleContainer')[0].classList.remove('p-24'); // TODO: CHECK COMPAT V5
  } catch (error) {
    console.error("CITEF padding vncConsoleContainer: ", error);
  }*/

  // Try to fullscreen
  try {
    const button = document.getElementsByClassName("guacamole-mat-icon-button")[0]; // TODO: CHECK COMPAT V5
    if (button)
      button.click();
  }
  catch (error) {
    console.error("CITEFController-handlerScenarioVnc: ", error);
  }

  const scenarioId = window.location.pathname.split('/')[3] || undefined;
  currentInterval = setInterval(async () => {
    const exerciseRunning = await isExerciseRunning(scenarioId);
    const scenarioInstantiated = await isScenarioInstantiated(scenarioId);
    if (!scenarioInstantiated || !exerciseRunning) {
      location.href = '/ui/scenario';
      return; // If scenario stopped, return to /ui/scenario
    }

    const statusText = document.getElementsByClassName("font-size-16");
    if (statusText.length > 0 && document.getElementsByClassName("mdc-button__label")[0].innerText === "Reconnect") {
      const connectbutton = document.getElementsByClassName("mdc-button__label")[0].parentNode;
      if (connectbutton) { // If Reconnect button exist, click on it
        connectbutton.click();
      }
    }
  }, 30000);
}

async function isExerciseRunning(scenarioId) {
  const state = await fetch(`/api/exercise/state/${scenarioId}`, {
    method: "GET",
  });
  let data = await state.json();
  return (data.exerciseState === "RUNNING");
}

async function isScenarioInstantiated(scenarioId) {
  const scenarioStatusResponse = await fetch("/api/scenario/instantiation_statuses", {
    headers: {
      "accept": "application/json",
      "content-type": "application/json"
    },
    body: JSON.stringify([scenarioId]),
    method: "POST",
  });

  const scenarioStatuses = await scenarioStatusResponse.json();
  return (scenarioStatuses.length > 0) &&
    (scenarioStatuses[0].status == "INSTANTIATION") &&
    (scenarioStatuses[0].scenarioInstanceStatus.status == "RUNNING");
}


// Trigger CITEFController on each URL change
(function (history) {
  let pushState = history.pushState;
  history.pushState = function () {
    setTimeout(() => {
      CITEFController();
    }, 400);
    return pushState.apply(history, arguments);
  };
})(window.history);

// Trigger CITEFController on first page load
window.onload = CITEFController;
