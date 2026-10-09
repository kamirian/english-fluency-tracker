// English Fluency Tracker — account card and bring-your-own AI connections.
// Copyright (c) 2026 Kiyan Amirian. All rights reserved.
(() => {
  const $a = selector => document.querySelector(selector);
  const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
  const keyPlaceholders = { openai: "sk-…", anthropic: "sk-ant-…", gemini: "AIza…", compatible: "Your service's API key" };
  let account = window.fluencyTracker?.getAccount?.() || { user: null, config: {}, syncConnected: false };
  let connections = [];
  let connectionsLoaded = false;
  let loadedForUser = "";

  async function api(path, method = "GET", body) {
    const response = await fetch(path, {
      method,
      headers: { Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || `The request failed (${response.status}).`);
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  const defaultConnection = () => connections.find(item => item.isDefault) || connections[0] || null;

  window.FluencyAI = {
    available: () => Boolean(account.user && defaultConnection()),
    describe: () => {
      const connection = defaultConnection();
      return connection ? `${connection.label} (${connection.model})` : "";
    },
    async run(task, payload = {}) {
      if (!window.FluencyAI.available()) throw new Error("Connect an AI in Settings first, or use Copy prompt with any AI chat.");
      const learner = window.fluencyTracker?.getProfile?.() || {};
      const startedFor = account.user?.id;
      let response;
      try {
        response = await api("/api/ai/run", "POST", { task, learner, ...payload });
      } catch (error) {
        if (error.status === 401) throw new Error("Your sign-in has expired. Sign in again in Settings, or use Copy prompt.");
        throw error;
      }
      // Never apply a result to a different account (or the signed-out view) than the one that asked.
      if ((window.fluencyTracker?.getAccount?.().user?.id || "") !== startedFor) throw new Error("You signed out or switched accounts, so this AI result was not saved.");
      return response;
    }
  };

  function syncAiButtons() {
    const ready = window.FluencyAI.available();
    const label = window.FluencyAI.describe();
    document.querySelectorAll("[data-ai-action]").forEach(button => {
      if (button.getAttribute("aria-busy") === "true") return;
      button.disabled = !ready;
      button.title = ready ? `Uses ${label}` : "Connect an AI in Settings to use this. Copy prompt works with any AI chat.";
    });
    window.dispatchEvent(new CustomEvent("fluency-ai-changed", { detail: { available: ready, label, signedIn: Boolean(account.user) } }));
  }

  function setAiState(message, tone = "") {
    const element = $a("#aiState");
    element.textContent = message;
    element.style.color = tone === "error" ? "var(--red)" : "";
  }

  function renderConnections() {
    const list = $a("#aiConnectionList");
    if (!account.user) {
      list.innerHTML = "";
      return;
    }
    if (!connections.length) {
      list.innerHTML = connectionsLoaded ? '<div class="empty">No AI connected yet. Add one below, or keep using Copy prompt.</div>' : "";
      return;
    }
    list.innerHTML = connections.map(item => `
      <article class="ai-connection ${item.isDefault ? "default" : ""}" data-connection-id="${escapeHtml(item.id)}">
        <div>
          <strong>${escapeHtml(item.label)}${item.isDefault ? '<span class="default-badge">In use</span>' : ""}</strong>
          <small>${escapeHtml(item.providerLabel)} · ${escapeHtml(item.model)}${item.baseUrl ? ` · ${escapeHtml(item.baseUrl)}` : ""} · key ••••${escapeHtml(item.keyHint)}${item.options?.reasoningEffort ? ` · effort: ${escapeHtml(item.options.reasoningEffort)}` : ""}</small>
        </div>
        <div class="library-actions">
          ${item.isDefault ? "" : '<button class="icon-btn" type="button" data-ai-conn="default">Use this</button>'}
          <button class="icon-btn" type="button" data-ai-conn="test">Test</button>
          <button class="icon-btn" type="button" data-ai-conn="edit">Edit</button>
          <button class="icon-btn" type="button" data-ai-conn="delete">Remove</button>
        </div>
      </article>`).join("");
  }

  async function loadConnections() {
    if (!account.user) return;
    try {
      const payload = await api("/api/ai/connections");
      connections = payload.connections || [];
      connectionsLoaded = true;
      loadedForUser = account.user.id;
    } catch (error) {
      setAiState(error.message, "error");
    }
    renderConnections();
    syncAiButtons();
  }

  function syncProviderFields() {
    const provider = $a("#aiProvider").value;
    const compatible = provider === "compatible";
    $a("#aiPresetField").hidden = !compatible;
    $a("#aiBaseUrlField").hidden = !compatible;
    $a("#aiEffortField").hidden = provider !== "openai";
    if (compatible && !$a("#aiBaseUrl").value && $a("#aiPreset").value) $a("#aiBaseUrl").value = $a("#aiPreset").value;
    if (!$a("#aiEditId").value) $a("#aiApiKey").placeholder = keyPlaceholders[provider];
  }

  function resetForm() {
    $a("#aiConnectionForm").reset();
    $a("#aiEditId").value = "";
    $a("#aiProvider").disabled = false;
    $a("#aiModelOptions").innerHTML = "";
    $a("#aiKeyLabel").textContent = "API key";
    $a("#aiSaveBtn").textContent = "Save & test";
    $a("#aiCancelBtn").hidden = true;
    syncProviderFields();
  }

  function formOptions() {
    const effort = $a("#aiEffort").value;
    return $a("#aiProvider").value === "openai" && effort ? { reasoningEffort: effort } : {};
  }

  async function loadModels() {
    const editId = $a("#aiEditId").value;
    const apiKey = $a("#aiApiKey").value.trim();
    if (!editId && !apiKey) return setAiState("Paste your API key first, then load your models.", "error");
    const button = $a("#aiLoadModelsBtn");
    button.disabled = true;
    setAiState("Asking your provider which models this key can use…");
    try {
      const body = editId && !apiKey ? { connectionId: editId } : { provider: $a("#aiProvider").value, apiKey, baseUrl: $a("#aiBaseUrl").value.trim() };
      const { models = [] } = await api("/api/ai/models", "POST", body);
      $a("#aiModelOptions").innerHTML = models.map(model => `<option value="${escapeHtml(model.id)}">${escapeHtml(model.name && model.name !== model.id ? model.name : "")}</option>`).join("");
      setAiState(models.length ? `Found ${models.length} model${models.length === 1 ? "" : "s"}. Click the Model box to choose one, or type a model ID.` : "No models were listed. Type the model ID from your provider's documentation.");
      if (models.length) $a("#aiModel").focus();
    } catch (error) {
      setAiState(error.message, "error");
    } finally {
      button.disabled = false;
    }
  }

  async function testConnection(id, quiet = false) {
    if (!quiet) setAiState("Testing the connection…");
    try {
      const result = await api(`/api/ai/connections/${id}/test`, "POST", {});
      if (result.ok) setAiState(`Connected ✓ ${result.model} answered. AI buttons across the tracker are ready.`);
      else setAiState(`Saved, but the test failed: ${result.error}`, "error");
      return result.ok;
    } catch (error) {
      setAiState(error.message, "error");
      return false;
    }
  }

  async function saveConnection(event) {
    event.preventDefault();
    const editId = $a("#aiEditId").value;
    const provider = $a("#aiProvider").value;
    const apiKey = $a("#aiApiKey").value.trim();
    const model = $a("#aiModel").value.trim();
    if (!editId && !apiKey) return setAiState("Paste your API key.", "error");
    if (!model) return setAiState("Choose or type a model. Load my models lists the ones your key can use.", "error");
    const button = $a("#aiSaveBtn");
    button.disabled = true;
    setAiState("Saving your connection…");
    try {
      const body = { label: $a("#aiLabel").value.trim(), model, options: formOptions() };
      const baseUrl = $a("#aiBaseUrl").value.trim().replace(/\/+$/, "");
      const saved = connections.find(item => item.id === editId);
      // Only send the base URL when it is new or changed, so renaming never re-validates it.
      if (provider === "compatible" && (!editId || baseUrl !== saved?.baseUrl)) body.baseUrl = baseUrl;
      if (apiKey) body.apiKey = apiKey;
      const { connection } = editId
        ? await api(`/api/ai/connections/${editId}`, "PATCH", body)
        : await api("/api/ai/connections", "POST", { ...body, provider });
      resetForm();
      await loadConnections();
      await testConnection(connection.id, true);
    } catch (error) {
      setAiState(error.message, "error");
    } finally {
      button.disabled = false;
    }
  }

  function editConnection(id) {
    const item = connections.find(value => value.id === id);
    if (!item) return;
    resetForm();
    $a("#aiEditId").value = item.id;
    $a("#aiProvider").value = item.provider;
    $a("#aiProvider").disabled = true;
    if (item.provider === "compatible") {
      const preset = [...$a("#aiPreset").options].find(option => option.value === item.baseUrl);
      $a("#aiPreset").value = preset ? preset.value : "";
      $a("#aiBaseUrl").value = item.baseUrl;
    }
    $a("#aiModel").value = item.model;
    $a("#aiEffort").value = item.options?.reasoningEffort || "";
    $a("#aiLabel").value = item.label;
    $a("#aiKeyLabel").textContent = "Replace API key · optional";
    $a("#aiApiKey").placeholder = "Leave blank to keep the saved key";
    $a("#aiSaveBtn").textContent = "Save changes & test";
    $a("#aiCancelBtn").hidden = false;
    syncProviderFields();
    $a("#aiModel").focus();
  }

  async function connectionAction(event) {
    const button = event.target.closest("[data-ai-conn]");
    const card = event.target.closest("[data-connection-id]");
    if (!button || !card) return;
    const id = card.dataset.connectionId;
    const action = button.dataset.aiConn;
    if (action === "edit") return editConnection(id);
    if (action === "test") return testConnection(id);
    try {
      if (action === "default") {
        await api(`/api/ai/connections/${id}`, "PATCH", { isDefault: true });
        setAiState("Switched the AI used across the tracker.");
      }
      if (action === "delete") {
        const item = connections.find(value => value.id === id);
        if (!confirm(`Remove “${item?.label || "this connection"}”? Its saved API key is deleted from the server.`)) return;
        await api(`/api/ai/connections/${id}`, "DELETE");
        if ($a("#aiEditId").value === id) resetForm();
        setAiState("Connection removed.");
      }
      await loadConnections();
    } catch (error) {
      setAiState(error.message, "error");
    }
  }

  function renderAccount() {
    const user = account.user;
    const config = account.config || {};
    $a("#signedOutBlock").hidden = Boolean(user);
    $a("#signedInBlock").hidden = !user;
    $a("#googleSignInBtn").hidden = !config.googleSignIn;
    $a("#devSignInBtn").hidden = !config.devLogin;
    $a("#signInUnavailable").hidden = Boolean(config.googleSignIn || config.devLogin);
    if (user) {
      $a("#accountName").textContent = user.name || user.email;
      $a("#accountEmail").textContent = user.email;
      const avatar = $a("#accountAvatar");
      if (/^https:\/\//.test(user.picture || "")) {
        avatar.src = user.picture;
        avatar.hidden = false;
      } else {
        avatar.removeAttribute("src");
        avatar.hidden = true;
      }
    }
    $a("#privacyNote").textContent = user
      ? `Signed in as ${user.email}. This browser keeps a copy that syncs with your account.`
      : "Your tracker always keeps a copy in this browser. Sign in with Google to use the same progress on every device.";
    const keysReady = config.keyStorage !== false;
    $a("#aiSignedOutNote").hidden = Boolean(user) && keysReady;
    $a("#aiSignedOutNote").textContent = user && !keysReady
      ? "This server is not set up to store API keys yet. Copy prompt still works with any AI chat."
      : "Sign in to connect an AI provider. Copy prompt works without signing in.";
    $a("#aiConnectionForm").hidden = !user || !keysReady;
    if (!user) {
      connections = [];
      connectionsLoaded = false;
      loadedForUser = "";
      resetForm();
      setAiState("");
    }
    renderConnections();
    syncAiButtons();
    if (user && keysReady && loadedForUser !== user.id) loadConnections();
  }

  $a("#aiProvider").addEventListener("change", () => {
    $a("#aiModel").value = "";
    $a("#aiModelOptions").innerHTML = "";
    if ($a("#aiProvider").value === "compatible" && !$a("#aiBaseUrl").value) $a("#aiBaseUrl").value = $a("#aiPreset").value;
    syncProviderFields();
  });
  $a("#aiPreset").addEventListener("change", () => {
    $a("#aiBaseUrl").value = $a("#aiPreset").value;
    $a("#aiModelOptions").innerHTML = "";
    if (!$a("#aiPreset").value) $a("#aiBaseUrl").focus();
  });
  $a("#aiLoadModelsBtn").addEventListener("click", loadModels);
  $a("#aiConnectionForm").addEventListener("submit", saveConnection);
  $a("#aiCancelBtn").addEventListener("click", () => {
    resetForm();
    setAiState("");
  });
  $a("#aiConnectionList").addEventListener("click", connectionAction);
  window.addEventListener("fluency-account-changed", event => {
    account = event.detail || account;
    renderAccount();
  });

  resetForm();
  renderAccount();
})();
