// ==UserScript==
// @name        CITEF Controller
// @namespace   uOttawa-IBM Cyber Range script
// @match       https://citefplus.griseo.ca/*
// @grant       window.focus
// @version     1.0
// @author      Julien Cassagne
// @description 2025-05-10, 10:28:14 p.m.
// @downloadURL https://raw.githubusercontent.com/UOttawa-Cyber-Range-Scenarios/userscripts/refs/heads/main/citefcontroller.user.js
// ==/UserScript==

// Note: We cannot rely on IDs as they change on successive page changes
// (e.g mat-input-0 can become mat-input-2 after accessing other pages)

async function CITEFController() {
  await new Promise(resolve => setTimeout(resolve, 1000)); // wait util js gets executed

  const path = window.location.pathname
  console.warn(`CITEFController: Starting on ${path}`)

  switch(path) {
    case '/login':
      await pageLogin();
      break;
    case '/password-reset':
      await pagePasswordReset();
      break;
    default:
      console.warn(`CITEFController: No function defined for ${path}`)
  }
}

async function pageLogin() {
  const username = document.getElementsByClassName("mat-input-element")[0]
  const password = document.getElementsByClassName("mat-input-element")[1]
  const submitButton = document.getElementsByClassName("submit-button")[0]

  if(username.value == "" || password.value == "") {
    console.warn("CITEFController: Missing username / password")
    return
  }
  submitButton.click()
}

async function pagePasswordReset() {
  location.href = '/scenario';
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
window.onload = CITEFController

