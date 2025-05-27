// ==UserScript==
// @name        Manage VM access and visibility
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
                body: "\"\"",
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
    const userIds = Object.values(studentIdDict);
    // Preprocess nodes into a map for quick lookup
    const nodeMap = {};
    for (let node of nodesValue) {
        nodeMap[node.displayName] = node;
    }
    const baseName = (selectedValue === "Automatique" || selectedValue === null) ? workstations[0].name : selectedValue.replace(/[^a-zA-Z]/g, '');
    const nodeInstancesResponse = await fetch(`/api/scenario_template/nodes_instances/${scenarioId}`);
    const nodeInstances = await nodeInstancesResponse.json();
    const nodeIdMap = {};
    for (const [parentKey, innerObj] of Object.entries(nodeInstances)) {
        for (const [key, value] of Object.entries(innerObj)) {
            const [displayName] = value;
            nodeIdMap[displayName] = parentKey;
        }
    }
    for (let i = 0; i < userIds.length; i++) {
        let userId = userIds[i];
        const indexedValue = `${baseName} [${i + 1}]`; // e.g., "Win Workstation [1]"
        const node = nodeMap[indexedValue];
        const nodeId = nodeIdMap[indexedValue];
        const assignUsers = await fetch(`/api/scenario_template/assign_user_vm_instances/${scenarioId}`, {
            headers: {
                "accept": "application/json",
                "content-type": "application/json",
                "x-xsrf-token": /XSRF-TOKEN=([^;]+)/.exec(document.cookie)[1]
            },
            method: "PUT",
            body: JSON.stringify({
                vmInstancesToAssign: [node.vmInstanceName],
                userIdToAssign: userId
            })
        });
        const nodeVisibility = await fetch(`/api/scenario_view`, {
            headers: {
                "accept": "application/json",
                "content-type": "application/json",
                "x-xsrf-token": /XSRF-TOKEN=([^;]+)/.exec(document.cookie)[1]
            },
            method: "PUT",
            body: JSON.stringify({
                vmInstancesToAssign: [node.vmInstanceName],
                userIdToAssign: userId,
                apiRouteBase: "scenario_view",
                allowedNodesIds: [nodeId],
                scenarioEnvironmentId: scenarioId,
                userId: userId,
            })
        });
        if (assignUsers.ok && nodeVisibility.ok) {
            console.log(`User ${userId} assigned successfully to ${indexedValue}`);
        } else {
            console.error("Assign or visibility failed:", await assignRes.text(), await visibilityRes.text());
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
    const loadingText = document.createElement("span");
    loadingText.innerText = "Loading...";
    loadingText.style.marginLeft = "10px";
    loadingText.style.display = "none";
    const toolbar = document.getElementsByClassName("mat-elevation-z1 mat-toolbar")[0];
    const container = toolbar.childNodes[1];
    container.appendChild(button);
    container.appendChild(dropdown);
    const nodes = await fetch(`/api/scenario_template/vm_instances/${scenarioId}`, {
        accept: "application/json",
        method: "GET",
    });
    const nodesValue = await nodes.json();
    const cleanedNamesSet = new Set();
    let options = [];
    if (!Array.isArray(nodesValue)) {
        return;
    }
    for (let node of nodesValue) {
        let newVmDisplayName = node.displayName.replace(/[^a-zA-Z\s]/g, '');
        if (newVmDisplayName.includes("Workstation") && !cleanedNamesSet.has(newVmDisplayName)) {
            cleanedNamesSet.add(newVmDisplayName);
            options.push(node.displayName);
            const newOption = document.createElement("option");
            newOption.value = node.displayName;
            newOption.text = node.displayName;
            dropdown.appendChild(newOption);
        }
    }
    dropdown.addEventListener("change", (event) => {
        selectedValue = event.target.value;
    });
    button.addEventListener("click", async () => {
        button.disabled = true;
        loadingText.style.display = "inline";

        try {
            await assignUsers(selectedValue, nodesValue);
        } catch (error) {
            console.error("Error in assignUsers:", error);
        } finally {
            button.disabled = false;
            loadingText.style.display = "none";
        }
    });
}
window.onload = AddButton

