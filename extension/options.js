const apiKey = document.getElementById("apiKey");
const model = document.getElementById("model");
const policy = document.getElementById("policy");
const saved = document.getElementById("saved");

async function defaultPolicy() {
  const res = await fetch(chrome.runtime.getURL("policy.md"));
  return res.text();
}

async function load() {
  const stored = await chrome.storage.local.get(["apiKey", "model", "policyMarkdown"]);
  apiKey.value = stored.apiKey || "";
  model.value = stored.model || "claude-haiku-4-5";
  policy.value = stored.policyMarkdown || (await defaultPolicy());
}

document.getElementById("save").addEventListener("click", async () => {
  await chrome.storage.local.set({
    apiKey: apiKey.value.trim(),
    model: model.value.trim() || "claude-haiku-4-5",
    policyMarkdown: policy.value,
  });
  saved.textContent = "Saved on this computer.";
});

document.getElementById("reload").addEventListener("click", async () => {
  policy.value = await defaultPolicy();
  saved.textContent = "Default policy loaded. Click Save to keep it.";
});

void load();
