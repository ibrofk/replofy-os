export const REPLOFY_WIDGET_URI = 'ui://replofy-os/workspace.html';

export const replofyWidgetHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Replofy OS</title>
    <style>
      :root {
        color: #18181b;
        background: #fafafa;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        background: #fafafa;
      }

      main {
        width: 100%;
        min-height: 320px;
        padding: 16px;
      }

      .shell {
        display: grid;
        gap: 12px;
      }

      .header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
      }

      .eyebrow {
        margin: 0 0 4px;
        color: #71717a;
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.18em;
        text-transform: uppercase;
      }

      h1 {
        margin: 0;
        color: #09090b;
        font-size: 18px;
        font-weight: 900;
        line-height: 1.15;
      }

      button {
        border: 0;
        border-radius: 999px;
        background: #09090b;
        color: #fff;
        cursor: pointer;
        font: inherit;
        font-size: 12px;
        font-weight: 800;
        padding: 9px 13px;
      }

      button:disabled {
        cursor: not-allowed;
        opacity: 0.55;
      }

      .grid {
        display: grid;
        gap: 8px;
        grid-template-columns: repeat(6, minmax(0, 1fr));
      }

      .metric,
      .panel,
      .row {
        border: 1px solid #e4e4e7;
        background: #fff;
        box-shadow: 0 1px 2px rgba(24, 24, 27, 0.04);
      }

      .metric {
        border-radius: 18px;
        padding: 12px;
      }

      .metric span {
        display: block;
        color: #71717a;
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }

      .metric strong {
        display: block;
        margin-top: 6px;
        color: #09090b;
        font-size: 20px;
        font-weight: 900;
      }

      .panel {
        border-radius: 20px;
        padding: 14px;
      }

      .panel h2 {
        margin: 0 0 10px;
        color: #09090b;
        font-size: 13px;
        font-weight: 900;
      }

      .list {
        display: grid;
        gap: 8px;
      }

      .row {
        border-radius: 14px;
        padding: 10px 12px;
      }

      .row-title {
        color: #18181b;
        font-size: 13px;
        font-weight: 800;
        line-height: 1.25;
      }

      .row-meta {
        margin-top: 4px;
        color: #71717a;
        font-size: 11px;
        line-height: 1.35;
      }

      .empty,
      .error {
        border: 1px dashed #d4d4d8;
        border-radius: 16px;
        color: #71717a;
        font-size: 12px;
        line-height: 1.45;
        padding: 14px;
      }

      .error {
        border-color: #fca5a5;
        color: #b91c1c;
      }

      form {
        display: flex;
        gap: 8px;
      }

      input {
        min-width: 0;
        flex: 1;
        border: 1px solid #e4e4e7;
        border-radius: 999px;
        background: #fff;
        color: #18181b;
        font: inherit;
        font-size: 13px;
        padding: 9px 12px;
        outline: none;
      }

      input:focus {
        border-color: #09090b;
      }

      @media (max-width: 520px) {
        main {
          padding: 12px;
        }

        .grid {
          grid-template-columns: 1fr;
        }

        .header {
          align-items: stretch;
          flex-direction: column;
        }

        form {
          flex-direction: column;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <div class="shell">
        <div class="header">
          <div>
            <p class="eyebrow">Replofy OS</p>
            <h1>Workspace command panel</h1>
          </div>
          <button id="refresh-button" type="button">Refresh</button>
        </div>

        <div id="status" class="empty">Loading workspace context...</div>

        <div id="content" class="shell" hidden>
          <div class="grid">
            <div class="metric"><span>Active goals</span><strong id="goal-count">0</strong></div>
            <div class="metric"><span>Open tasks</span><strong id="task-count">0</strong></div>
            <div class="metric"><span>Open bugs</span><strong id="bug-count">0</strong></div>
            <div class="metric"><span>Open leads</span><strong id="lead-count">0</strong></div>
            <div class="metric"><span>Accounts</span><strong id="account-count">0</strong></div>
            <div class="metric"><span>Due</span><strong id="due-count">0</strong></div>
          </div>

          <div class="panel">
            <h2>Quick task</h2>
            <form id="task-form" autocomplete="off">
              <input id="task-title" name="title" placeholder="Create a task" />
              <button id="task-button" type="submit">Create</button>
            </form>
          </div>

          <div class="panel">
            <h2>Active cycle goals</h2>
            <div id="goals" class="list"></div>
          </div>

          <div class="panel">
            <h2>Open tasks</h2>
            <div id="tasks" class="list"></div>
          </div>

          <div class="panel">
            <h2>Open bugs</h2>
            <div id="bugs" class="list"></div>
          </div>

          <div class="panel">
            <h2>Growth follow-ups</h2>
            <div id="leads" class="list"></div>
          </div>
        </div>
      </div>
    </main>

    <script type="module">
      const statusEl = document.querySelector("#status");
      const contentEl = document.querySelector("#content");
      const refreshButton = document.querySelector("#refresh-button");
      const taskForm = document.querySelector("#task-form");
      const taskInput = document.querySelector("#task-title");
      const taskButton = document.querySelector("#task-button");
      const goalCount = document.querySelector("#goal-count");
      const taskCount = document.querySelector("#task-count");
      const bugCount = document.querySelector("#bug-count");
      const leadCount = document.querySelector("#lead-count");
      const accountCount = document.querySelector("#account-count");
      const dueCount = document.querySelector("#due-count");
      const goalsEl = document.querySelector("#goals");
      const tasksEl = document.querySelector("#tasks");
      const bugsEl = document.querySelector("#bugs");
      const leadsEl = document.querySelector("#leads");

      let rpcId = 0;
      const pendingRequests = new Map();
      let bridgeReady;

      const rpcNotify = (method, params) => {
        window.parent.postMessage({ jsonrpc: "2.0", method, params }, "*");
      };

      const rpcRequest = (method, params) =>
        new Promise((resolve, reject) => {
          const id = ++rpcId;
          pendingRequests.set(id, { resolve, reject });
          window.parent.postMessage({ jsonrpc: "2.0", id, method, params }, "*");
        });

      window.addEventListener(
        "message",
        (event) => {
          if (event.source !== window.parent) return;
          const message = event.data;
          if (!message || message.jsonrpc !== "2.0") return;

          if (typeof message.id === "number") {
            const pending = pendingRequests.get(message.id);
            if (!pending) return;
            pendingRequests.delete(message.id);
            if (message.error) {
              pending.reject(message.error);
              return;
            }
            pending.resolve(message.result);
            return;
          }

          if (message.method === "ui/notifications/tool-result") {
            renderWorkspace(message.params?.structuredContent);
          }
        },
        { passive: true }
      );

      function renderRows(target, rows, emptyText, metaBuilder) {
        target.innerHTML = "";
        if (!rows?.length) {
          const empty = document.createElement("div");
          empty.className = "empty";
          empty.textContent = emptyText;
          target.appendChild(empty);
          return;
        }

        rows.slice(0, 8).forEach((item) => {
          const row = document.createElement("div");
          row.className = "row";
          const title = document.createElement("div");
          title.className = "row-title";
          title.textContent = item.title || item.name || item.id || "Untitled";
          const meta = document.createElement("div");
          meta.className = "row-meta";
          meta.textContent = metaBuilder(item);
          row.appendChild(title);
          row.appendChild(meta);
          target.appendChild(row);
        });
      }

      function renderWorkspace(data) {
        if (!data || !data.workspace) return;

        statusEl.hidden = true;
        contentEl.hidden = false;
        goalCount.textContent = String(data.workspace.counts.activeGoals || 0);
        taskCount.textContent = String(data.workspace.counts.openTasks || 0);
        bugCount.textContent = String(data.workspace.counts.openBugs || 0);
        leadCount.textContent = String(data.workspace.counts.openLeads || 0);
        accountCount.textContent = String(data.workspace.counts.accounts || 0);
        dueCount.textContent = String(data.workspace.counts.followUpsDue || 0);

        renderRows(goalsEl, data.workspace.activeGoals, "No active cycle goals.", (item) => item.status || "active");
        renderRows(tasksEl, data.workspace.openTasks, "No open tasks.", (item) => [item.status, item.effortPoints ? item.effortPoints + " pts" : ""].filter(Boolean).join(" / "));
        renderRows(bugsEl, data.workspace.openBugs, "No open bugs.", (item) => [item.status, item.severity].filter(Boolean).join(" / "));
        renderRows(leadsEl, data.workspace.followUpsDue || data.workspace.openLeads, "No due growth follow-ups.", (item) => [item.stage, item.nextAction, item.companyName].filter(Boolean).join(" / "));
      }

      async function initializeBridge() {
        await rpcRequest("ui/initialize", {
          appInfo: { name: "replofy-os-widget", version: "0.1.0" },
          appCapabilities: {},
          protocolVersion: "2026-01-26",
        });
        rpcNotify("ui/notifications/initialized", {});
      }

      async function callTool(name, args = {}) {
        await bridgeReady;
        const result = await rpcRequest("tools/call", { name, arguments: args });
        renderWorkspace(result?.structuredContent);
        return result;
      }

      async function refresh() {
        refreshButton.disabled = true;
        statusEl.hidden = false;
        statusEl.className = "empty";
        statusEl.textContent = "Loading workspace context...";
        try {
          await callTool("get_workspace_context", { scope: "execution" });
        } catch (error) {
          statusEl.className = "error";
          statusEl.textContent = error?.message || "Unable to load workspace context.";
        } finally {
          refreshButton.disabled = false;
        }
      }

      refreshButton.addEventListener("click", refresh);
      taskForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const title = taskInput.value.trim();
        if (!title) return;
        taskButton.disabled = true;
        try {
          await callTool("create_task", { title });
          taskInput.value = "";
          await refresh();
        } catch (error) {
          statusEl.hidden = false;
          statusEl.className = "error";
          statusEl.textContent = error?.message || "Unable to create task.";
        } finally {
          taskButton.disabled = false;
        }
      });

      bridgeReady = initializeBridge();
      refresh();
    </script>
  </body>
</html>`;
