/**
 * Usage Analytics Dashboard — webview panel showing productivity metrics.
 *
 * Displays words/min trends, accuracy over time, most-used commands,
 * daily usage patterns, time saved estimates, and model performance comparison.
 * All data is local and opt-in.
 */

import * as vscode from 'vscode';
import { usageAnalytics, TimePeriod, UsageMetrics, ProductivityInsight } from './usageAnalytics';

/**
 * Show the usage analytics dashboard in a webview panel.
 */
export function showUsageAnalyticsDashboard(context: vscode.ExtensionContext): void {
  usageAnalytics.init(context);

  const panel = vscode.window.createWebviewPanel(
    'voxpilot.usageAnalytics',
    'VoxPilot: Usage Analytics',
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true },
  );

  panel.webview.html = getWebviewContent();

  panel.webview.onDidReceiveMessage(
    (message: { command: string; period?: TimePeriod }) => {
      switch (message.command) {
        case 'getMetrics': {
          const period = message.period || 'week';
          const metrics = usageAnalytics.getMetrics(period);
          const insights = usageAnalytics.getInsights();
          panel.webview.postMessage({ command: 'metricsData', metrics, insights });
          break;
        }
        case 'enable': {
          usageAnalytics.enable();
          panel.webview.postMessage({ command: 'statusUpdate', enabled: true });
          break;
        }
        case 'disable': {
          usageAnalytics.disable(false);
          panel.webview.postMessage({ command: 'statusUpdate', enabled: false });
          break;
        }
        case 'clearData': {
          usageAnalytics.clearAll();
          const metrics = usageAnalytics.getMetrics('week');
          panel.webview.postMessage({ command: 'metricsData', metrics, insights: [] });
          vscode.window.showInformationMessage('VoxPilot: Analytics data cleared.');
          break;
        }
        case 'exportData': {
          const data = usageAnalytics.exportData();
          vscode.workspace.openTextDocument({ content: data, language: 'json' })
            .then(doc => vscode.window.showTextDocument(doc));
          break;
        }
        case 'getStatus': {
          panel.webview.postMessage({ command: 'statusUpdate', enabled: usageAnalytics.isEnabled() });
          break;
        }
      }
    },
    undefined,
    context.subscriptions,
  );
}

function getWebviewContent(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Usage Analytics</title>
<style>
  :root {
    --bg: var(--vscode-editor-background);
    --fg: var(--vscode-editor-foreground);
    --accent: var(--vscode-textLink-foreground);
    --border: var(--vscode-widget-border, #444);
    --card-bg: var(--vscode-editorWidget-background, #1e1e2e);
    --muted: var(--vscode-descriptionForeground, #888);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: var(--vscode-font-family); color: var(--fg); background: var(--bg); padding: 20px; }
  h1 { font-size: 1.4em; margin-bottom: 8px; }
  .subtitle { color: var(--muted); margin-bottom: 20px; font-size: 0.9em; }
  .controls { display: flex; gap: 8px; margin-bottom: 20px; flex-wrap: wrap; align-items: center; }
  .controls button, .controls select {
    padding: 6px 12px; border: 1px solid var(--border); background: var(--card-bg);
    color: var(--fg); border-radius: 4px; cursor: pointer; font-size: 0.85em;
  }
  .controls button:hover { background: var(--accent); color: #fff; }
  .controls select { appearance: auto; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 24px; }
  .card {
    background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px;
    padding: 16px; text-align: center;
  }
  .card .value { font-size: 1.8em; font-weight: bold; color: var(--accent); }
  .card .label { font-size: 0.8em; color: var(--muted); margin-top: 4px; }
  .section { margin-bottom: 24px; }
  .section h2 { font-size: 1.1em; margin-bottom: 12px; border-bottom: 1px solid var(--border); padding-bottom: 6px; }
  .insight {
    background: var(--card-bg); border-left: 3px solid var(--accent);
    padding: 10px 14px; margin-bottom: 8px; border-radius: 4px; font-size: 0.9em;
  }
  .insight .type { font-size: 0.75em; text-transform: uppercase; color: var(--muted); margin-bottom: 2px; }
  .bar-chart { display: flex; align-items: flex-end; gap: 4px; height: 100px; padding: 8px 0; }
  .bar-chart .bar {
    flex: 1; background: var(--accent); border-radius: 3px 3px 0 0; min-width: 8px;
    position: relative; transition: height 0.3s;
  }
  .bar-chart .bar:hover { opacity: 0.8; }
  .bar-chart .bar .tooltip {
    position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%);
    background: var(--card-bg); border: 1px solid var(--border); padding: 3px 6px;
    font-size: 0.7em; white-space: nowrap; border-radius: 3px; display: none;
  }
  .bar-chart .bar:hover .tooltip { display: block; }
  .bar-labels { display: flex; gap: 4px; font-size: 0.65em; color: var(--muted); }
  .bar-labels span { flex: 1; text-align: center; }
  .commands-list { list-style: none; }
  .commands-list li {
    display: flex; justify-content: space-between; padding: 6px 0;
    border-bottom: 1px solid var(--border); font-size: 0.85em;
  }
  .commands-list li .count { color: var(--accent); font-weight: bold; }
  .opt-in { text-align: center; padding: 40px; }
  .opt-in p { margin-bottom: 16px; color: var(--muted); }
  .opt-in button { padding: 10px 24px; font-size: 1em; }
  .hidden { display: none; }
  .actions { display: flex; gap: 8px; margin-top: 12px; }
  .actions button { font-size: 0.8em; padding: 4px 10px; }
</style>
</head>
<body>
  <h1>📊 Usage Analytics</h1>
  <p class="subtitle">Your voice coding productivity metrics — all data stays local.</p>

  <div id="opt-in-view" class="opt-in hidden">
    <p>Analytics is currently disabled. Enable it to start tracking your voice coding metrics.</p>
    <p style="font-size:0.85em;">Tracked locally: words/min, accuracy, commands used, time saved. Nothing leaves your machine.</p>
    <button onclick="enableAnalytics()">Enable Analytics</button>
  </div>

  <div id="dashboard" class="hidden">
    <div class="controls">
      <select id="period-select" onchange="changePeriod()" aria-label="Time period">
        <option value="day">Today</option>
        <option value="week" selected>This Week</option>
        <option value="month">This Month</option>
        <option value="all">All Time</option>
      </select>
      <button onclick="exportData()" title="Export analytics data">Export</button>
      <button onclick="disableAnalytics()" title="Disable analytics">Disable</button>
      <button onclick="clearData()" title="Clear all analytics data">Clear Data</button>
    </div>

    <div class="grid">
      <div class="card"><div class="value" id="wpm">—</div><div class="label">Words / Minute</div></div>
      <div class="card"><div class="value" id="total-words">—</div><div class="label">Total Words</div></div>
      <div class="card"><div class="value" id="accuracy">—</div><div class="label">Accuracy</div></div>
      <div class="card"><div class="value" id="time-saved">—</div><div class="label">Time Saved</div></div>
      <div class="card"><div class="value" id="sessions">—</div><div class="label">Sessions</div></div>
      <div class="card"><div class="value" id="commands">—</div><div class="label">Commands Used</div></div>
    </div>

    <div class="section" id="insights-section">
      <h2>💡 Insights</h2>
      <div id="insights-list"></div>
    </div>

    <div class="section">
      <h2>📈 Daily Activity</h2>
      <div class="bar-chart" id="daily-chart"></div>
      <div class="bar-labels" id="daily-labels"></div>
    </div>

    <div class="section">
      <h2>🎤 Top Commands</h2>
      <ul class="commands-list" id="commands-list"></ul>
      <p id="no-commands" class="hidden" style="color:var(--muted);font-size:0.85em;">No commands recorded yet.</p>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg.command === 'statusUpdate') {
        toggleView(msg.enabled);
      } else if (msg.command === 'metricsData') {
        renderMetrics(msg.metrics, msg.insights);
      }
    });

    // Initial load
    vscode.postMessage({ command: 'getStatus' });
    vscode.postMessage({ command: 'getMetrics', period: 'week' });

    function toggleView(enabled) {
      document.getElementById('opt-in-view').classList.toggle('hidden', enabled);
      document.getElementById('dashboard').classList.toggle('hidden', !enabled);
    }

    function changePeriod() {
      const period = document.getElementById('period-select').value;
      vscode.postMessage({ command: 'getMetrics', period });
    }

    function enableAnalytics() { vscode.postMessage({ command: 'enable' }); vscode.postMessage({ command: 'getMetrics', period: 'week' }); }
    function disableAnalytics() { vscode.postMessage({ command: 'disable' }); }
    function clearData() { vscode.postMessage({ command: 'clearData' }); }
    function exportData() { vscode.postMessage({ command: 'exportData' }); }

    function renderMetrics(m, insights) {
      toggleView(true);
      document.getElementById('wpm').textContent = m.avgWordsPerMinute || '—';
      document.getElementById('total-words').textContent = m.totalWords.toLocaleString();
      document.getElementById('accuracy').textContent = m.totalTranscriptions > 0 ? Math.round(m.accuracyRate * 100) + '%' : '—';
      document.getElementById('time-saved').textContent = formatTime(m.estimatedTimeSavedMs);
      document.getElementById('sessions').textContent = m.sessions;
      document.getElementById('commands').textContent = m.commandsUsed;

      // Insights
      const list = document.getElementById('insights-list');
      list.innerHTML = '';
      if (insights && insights.length > 0) {
        document.getElementById('insights-section').classList.remove('hidden');
        insights.forEach(i => {
          const div = document.createElement('div');
          div.className = 'insight';
          div.innerHTML = '<div class="type">' + i.type + '</div>' + i.message;
          list.appendChild(div);
        });
      } else {
        document.getElementById('insights-section').classList.add('hidden');
      }

      // Daily chart
      const chart = document.getElementById('daily-chart');
      const labels = document.getElementById('daily-labels');
      chart.innerHTML = '';
      labels.innerHTML = '';
      if (m.dailyBreakdown && m.dailyBreakdown.length > 0) {
        const maxWords = Math.max(...m.dailyBreakdown.map(d => d.words), 1);
        m.dailyBreakdown.forEach(d => {
          const pct = (d.words / maxWords) * 100;
          const bar = document.createElement('div');
          bar.className = 'bar';
          bar.style.height = Math.max(pct, 2) + '%';
          bar.innerHTML = '<span class="tooltip">' + d.date.slice(5) + ': ' + d.words + ' words</span>';
          chart.appendChild(bar);
          const lbl = document.createElement('span');
          lbl.textContent = d.date.slice(8);
          labels.appendChild(lbl);
        });
      }

      // Top commands
      const cmdList = document.getElementById('commands-list');
      const noCmd = document.getElementById('no-commands');
      cmdList.innerHTML = '';
      if (m.topCommands && m.topCommands.length > 0) {
        noCmd.classList.add('hidden');
        m.topCommands.forEach(c => {
          const li = document.createElement('li');
          li.innerHTML = '<span>' + c.id + '</span><span class="count">' + c.count + '</span>';
          cmdList.appendChild(li);
        });
      } else {
        noCmd.classList.remove('hidden');
      }
    }

    function formatTime(ms) {
      if (!ms || ms < 1000) return '0s';
      const sec = Math.floor(ms / 1000);
      if (sec < 60) return sec + 's';
      const min = Math.floor(sec / 60);
      if (min < 60) return min + 'm';
      const hr = Math.floor(min / 60);
      return hr + 'h ' + (min % 60) + 'm';
    }
  </script>
</body>
</html>`;
}
