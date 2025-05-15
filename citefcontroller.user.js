// ==UserScript==
// @name        CITEF Controller
// @namespace   uOttawa-IBM Cyber Range script
// @match       https://citefplus.griseo.ca/*
// @match       http://10.20.1.11:8080/*
// @grant       none
// @version     1.1
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
  'scenario-vnc': handlerScenarioVnc
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

  if(username.value == "" || password.value == "") {
    console.warn("CITEFController-handlerLogin: Missing username / password");
    return;
  }
  submitButton.click();
}

async function handlerRedirectScenario() {
  location.href = '/scenario';
}

async function handlerScenarioVnc() {
  const fullscreen = document.getElementsByClassName("vnc-console-mat-icon-button")[0];
  fullscreen.click()
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

