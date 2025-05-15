// ==UserScript==
// @name        CITEF Controller
// @namespace   uOttawa-IBM Cyber Range script
// @match       https://citefplus.griseo.ca/*
// @match       http://10.20.1.11:8080/*
// @grant       none
// @version     1.4
// @author      Julien Cassagne
// @description 2025-05-10, 10:28:14 p.m.
// @downloadURL https://raw.githubusercontent.com/UOttawa-Cyber-Range-Scenarios/userscripts/refs/heads/main/citefcontroller.user.js
// ==/UserScript==

// Note: We cannot rely on IDs as they change on successive page changes
// (e.g mat-input-0 can become mat-input-2 after accessing other pages)

const routeHandlers = {
  'login': handlerLogin,
  'password-reset': handlerRedirectScenario,
  'home': handlerRedirectScenario,
  'scenario-vnc': handlerScenarioVnc,
  'scenario': handlerScenario,
};

async function CITEFController() {
  await new Promise(resolve => setTimeout(resolve, 1000)); // wait util js gets executed

  const route = window.location.pathname.split('/')[1] || undefined;
  console.warn(`CITEFController: Starting on ${route}`);

  const handler = routeHandlers[route];
  if (handler) {
    await handler();
  } else {
    console.warn(`CITEFController: No function defined for ${route}`);
  }
}

async function handlerLogin() {
  const username = document.getElementsByClassName("mat-input-element")[0];
  const password = document.getElementsByClassName("mat-input-element")[1];
  const submitButton = document.getElementsByClassName("submit-button")[0];

  if (username.value == "" || password.value == "") {
    console.warn("CITEFController-handlerLogin: Missing username / password");
    return;
  }
  submitButton.click();
}

async function handlerRedirectScenario() {
  location.href = '/scenario';
}

async function handlerScenario() {
  const checkScenario = async () => {
    try {
      const created = await fetch("/api/scenario/page/0/20/DESC/created", {
        headers: {
          "accept": "application/json",
          "content-type": "application/json",
          "x-xsrf-token": /XSRF-TOKEN=([^;]+)/.exec(document.cookie)[1]
        },

        body: "{\"filter\":\"\"}",
        method: "POST",
        mode: "cors",
        // credentials: "include"
      });

      const created_json = await created.json();
      const scenariodata = created_json.content.find(item => item.status === "INSTANTIATION")
      if (!scenariodata) { // no scenario instintiated
        return
      }
      let scenarioId = scenariodata.id;
      localStorage.setItem("scenarioId", scenarioId);
      const nodeInstancesResponse = await fetch(`/api/scenario_template/nodes_instances/${scenarioId}`, {
        method: "GET",
        headers: {
          "accept": "application/json",
        },
        credentials: "include"
      });
      const nodeInstances = await nodeInstancesResponse.json();
      let nodeInstanceId = Object.keys(nodeInstances).map(key => Object.keys(nodeInstances[key])[0])[0];
      localStorage.setItem("nodeInstanceId", nodeInstanceId);
      if (!nodeInstanceId) {
        console.warn("No node instance ID found");
        return;
      }
      const state = await fetch(`https://citefplus.griseo.ca/api/exercise/state/${scenarioId}`, {

        headers: {
          "accept": "application/json",
          "content-type": "application/json",
          "x-xsrf-token": /XSRF-TOKEN=([^;]+)/.exec(document.cookie)[1]
        },
        method: "GET",
        mode: "cors",
        // credentials: "include"
      });
      const exerciseState = await state.json();
      if (exerciseState.exerciseState === "NOT_RUNNING") {
        return
      }

      const targetUrl = `/scenario-vnc/${scenarioId}/${nodeInstanceId}`;
      window.location.href = targetUrl;
    }
    catch (error) {
      console.error("Error in handlerScenario:", error);
    }
  }

  setInterval(checkScenario, 30000)
  await checkScenario();
}

async function handlerScenarioVnc() {
  let scenarioId = localStorage.getItem("scenarioId");
  let nodeInstanceId = localStorage.getItem("nodeInstanceId");
  try {
    const button = document.getElementsByClassName("vnc-console-mat-icon-button")[0];
    if (button)
      button.click();
    console.log("Button clicked successfully!");
  }
  catch (error) {
    console.error("Error in handlerScenario_vnc:", error);
  }

  setInterval(async () => {
    const scenarioStatusResponse = await fetch("/api/scenario/instantiation_statuses", {
      headers: {
        "accept": "application/json",
        "content-type": "application/json",
        "x-xsrf-token": /XSRF-TOKEN=([^;]+)/.exec(document.cookie)[1]
      },

      body: JSON.stringify([scenarioId]),
      method: "POST",
      mode: "cors",
      credentials: "include"
    });

    const scenarioStatuses = await scenarioStatusResponse.json();
    if (!scenarioStatuses) {
      console.warn("No running scenario found");
      return;
    }
    if (scenarioStatuses[0].status != "INSTANTIATION") {
      location.href = '/scenario';
    }
  }, 30000)


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
