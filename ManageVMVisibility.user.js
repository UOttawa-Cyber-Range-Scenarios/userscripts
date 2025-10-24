// ==UserScript==
// @name        Manage VM access and visibility2
// @namespace   uOttawa-IBM Cyber Range script
// @match       https://citefplus.griseo.ca/scenario-user-management/*
// @match       https://citefplus.griseo.ca/scenario-vm-access-management/*
// @match       http://10.20.1.11:8080/scenario-user-management/*
// @match       http://10.20.1.11:8080/scenario-vm-access-management/*
// @grant       none
// @author      Sarra Sassi
// @version     1.0
// @description Automatically add student users to scenarios and set permissions on CITEF.
// @homepage https://github.com/UOttawa-Cyber-Range-Scenarios/userscripts
// @downloadURL https://raw.githubusercontent.com/UOttawa-Cyber-Range-Scenarios/userscripts/refs/heads/main/ManageVMVisibility.user.js
// ==/UserScript==

async function assignUsers(selectedValue, nodesValue) {
    const scenarioId = window.location.pathname.split('/')[2];
    let studentIdDict = {};
    const Users = await fetch(`/api/user/for_object/${scenarioId}/ScenarioEnvironment`, {
        method: "GET",
    });
    let usersJson = await Users.json();
    for (let user of usersJson) {
        if (user.username.startsWith("student")) {
            studentIdDict[user.username] = user.id
            const assignRes = await fetch(`/api/scenario/assign_team_member/${scenarioId}/${user.id}`, {
                headers: {
                    "accept": "application/json",
                    "content-type": "application/json",
                    "x-xsrf-token": /XSRF-TOKEN=([^;]+)/.exec(document.cookie)[1]
                },
                body: "{}",
                method: "POST",
            });
            if (!assignRes.ok) {
                console.error(`Failed to assign team member for ${user.username}:`, await assignRes.text());
            }

            const permRes = await fetch(`/api/scenario/set_permissions`, {
                headers: {
                    "accept": "application/json",
                    "content-type": "application/json",
                    "x-xsrf-token": /XSRF-TOKEN=([^;]+)/.exec(document.cookie)[1]
                },
                method: "PUT",
                body: JSON.stringify({
                    objectId: scenarioId,
                    objectType: "ScenarioEnvironment",
                    assignToUserId: user.id,
                    objectPermissions: ["FINALIZED_SCENARIO_VIEW"]
                })
            });
            if (!permRes.ok) {
                console.error(`Failed to set permissions for ${user.username}:`, await permRes.text());
            }
        }
    }
    const alternative = await fetch(`/api/scenario/${scenarioId}`, {
        accept: "application/json",
        method: "GET",
    });
    let alternativeValue = await alternative.json();
    const vmInstance = await fetch(`/api/scenario/alternative_details/${scenarioId}/${alternativeValue.scenarioEnvironmentRequest.activeAlternativeId}`, {
        accept: "application/json",
        method: "GET",
    });
    let vmInst = await vmInstance.json();
    const workstations = vmInst.layers
        .filter(layer => layer.layerType === "NETWORK")
        .flatMap(layer => layer.nodes)
        .filter(node => node.virtualMachine && node.virtualMachine.multiplicity >= 30);
    await handleDropdownSelection(selectedValue, studentIdDict, nodesValue, scenarioId, workstations);
}

async function handleDropdownSelection(selectedValue, studentIdDict, nodesValue, scenarioId, workstations) {
    const nodeMap = {};
    let baseName = "";
    for (let node of nodesValue) {
        nodeMap[node.displayName] = node;
    }
    if ((selectedValue === "Automatique" || selectedValue === null) && workstations[0] == undefined) {
        console.log("No workstations with multiplicity over 30. Please select a value from the dropdown list.");
        return;
    }
    else {
        baseName = (selectedValue === "Automatique" || selectedValue === null) ? workstations[0].name : selectedValue.replace(/[^a-zA-Z\s]/g, '');
    }
    const nodeInstancesResponse = await fetch(`/api/scenario_template/nodes_instances/${scenarioId}`);
    const nodeInstances = await nodeInstancesResponse.json();
    const nodeIdMap = {};
    for (const [parentKey, innerObj] of Object.entries(nodeInstances)) {
        for (const [key, value] of Object.entries(innerObj)) {
            const [displayName] = value; // accessing the first element of the array
            nodeIdMap[displayName] = parentKey;
        }
    }
    await setStudentsPermission(nodeIdMap, studentIdDict, scenarioId, baseName, nodeMap, selectedValue);
}

// --- Modified to support round-robin assignment when students > available workstation instances ---
async function setStudentsPermission(nodeIdMap, studentIdDict, scenarioId, baseName, nodeMap, selectedValue) {
  const userIds = Object.values(studentIdDict);

  // 🔄 New: collect all available workstation keys
  const keyPattern = new RegExp(`^${baseName}\\s*\\[(\\d+)\\]$`);
  const availableKeys = Object.keys(nodeMap)
    .map(k => ({ k, m: k.match(keyPattern) }))
    .filter(x => x.m)
    .sort((a, b) => parseInt(a.m[1], 10) - parseInt(b.m[1], 10))
    .map(x => x.k);

  const count = availableKeys.length;
  if (count === 0) {
    console.warn(`No VM instances found for base "${baseName}". Nothing to assign.`);
    return;
  }

  for (let i = 0; i < userIds.length; i++) {
    const userId = userIds[i];

    // 🔄 New: round-robin pick (wraps back when i > count)
    const indexedKey = availableKeys[i % count];
    const node = nodeMap[indexedKey];
    const nodeId = nodeIdMap[indexedKey];

    if (!node || !nodeId) {
      console.warn(`Missing node/nodeId for "${indexedKey}". Skipping user ${userId}.`);
      continue; // 🔄 Changed from "break" to "continue"
    }

    // Assign VM instance to user
    const assignUsers = await fetch(`/api/scenario_template/assign_user_vm_instances/${scenarioId}`, {
      headers: {
        "accept": "application/json",
        "content-type": "application/json",
        "x-xsrf-token": /XSRF-TOKEN=([^;]+)/.exec(document.cookie)[1]
      },
      method: "PUT",
      body: JSON.stringify({
        vmInstancesToAssign: [node.vmInstanceName],
        userIdToAssign: userId,
      })
    });

    // Ensure node visibility for the user
    const bodyData = JSON.stringify({
      apiRouteBase: "scenario_view",
      allowedNodesIds: [nodeId],
      scenarioEnvironmentId: scenarioId,
      userId: userId,
    });
    const headers = {
      "accept": "application/json",
      "content-type": "application/json",
      "x-xsrf-token": /XSRF-TOKEN=([^;]+)/.exec(document.cookie)[1]
    };

    let nodeVsibility = await fetch('/api/scenario_view', {
      headers,
      method: "POST",
      body: bodyData
    });

    if (nodeVsibility.status === 400) {
      nodeVsibility = await fetch('/api/scenario_view', {
        headers,
        method: "PUT",
        body: bodyData
      });
    }

    if (assignUsers.ok) {
      console.log(`User ${userId} assigned to ${indexedKey} (round-robin).`);
    } else {
      console.error("Assign or visibility failed:", await assignUsers.text?.());
    }
  }
}

async function AddButton() {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const scenarioId = window.location.pathname.split('/')[2];
    let selectedValue = "Automatique";
    const button = document.createElement("button");
    button.innerText = "Assign users";
    button.className = "mat-raised-button mat-accent ng-star-inserted";
    const dropdown = document.createElement("select");
    dropdown.id = "vmDropdown";
    dropdown.className = "mat-select ng-star-inserted";
    const placeholder = document.createElement("option");
    placeholder.text = "Automatique";
    placeholder.value = "Automatique";
    placeholder.selected = true;
    dropdown.appendChild(placeholder);
    const toolbar = document.getElementsByClassName("mat-elevation-z1 mat-toolbar")[0];
    const container = toolbar.childNodes[1];
    container.appendChild(button);
    container.appendChild(dropdown);
    const nodes = await fetch(`/api/scenario_template/vm_instances/${scenarioId}`, {
        accept: "application/json",
        method: "GET",
    });
    const nodesValue = await nodes.json();
    let options = [];
    if (!Array.isArray(nodesValue)) {
        return;
    }
    for (let node of nodesValue) {
        let newVmDisplayName = node.displayName.replace(/[^a-zA-Z\s]/g, '');
        if (newVmDisplayName.includes("Workstation") && !(options.includes(newVmDisplayName))) {
            options.push(newVmDisplayName);
            const newOption = document.createElement("option");
            newOption.value = newVmDisplayName;
            newOption.text = newVmDisplayName;
            dropdown.appendChild(newOption);
        }
    }
    dropdown.addEventListener("change", (event) => {
        selectedValue = event.target.value;
    });
    button.addEventListener("click", async () => {
        button.disabled = true;
        try {
            await assignUsers(selectedValue, nodesValue);
        } catch (error) {
            console.error("Error in assignUsers:", error);
        } finally {
            button.disabled = false;
        }
    });
}
window.onload = AddButton

