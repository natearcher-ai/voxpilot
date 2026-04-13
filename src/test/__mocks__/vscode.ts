// Minimal vscode mock for unit tests

const _configValues: Record<string, any> = {};

export const workspace = {
  getConfiguration: () => ({
    get: (key: string, defaultVal?: any) => {
      return key in _configValues ? _configValues[key] : defaultVal;
    },
    update: async () => {},
  }),
  onDidChangeConfiguration: () => ({ dispose: () => {} }),
};

/** Set a config value for testing */
export function __setConfig(key: string, value: any): void {
  _configValues[key] = value;
}

/** Clear all config overrides */
export function __clearConfig(): void {
  for (const k of Object.keys(_configValues)) {
    delete _configValues[k];
  }
}

/** Track calls to commands.executeCommand */
export const __executeCommandCalls: string[] = [];

/** Track calls to commands.executeCommand with full arguments */
export const __executeCommandCallsWithArgs: Array<{ cmd: string; args: any[] }> = [];

/** Track calls to env.clipboard.writeText */
export const __clipboardWriteCalls: string[] = [];

/** Stored clipboard content for readText */
let __clipboardContent = '';

/** Commands that should reject when executed */
const __failingCommands: Set<string> = new Set();

/** Set the clipboard content for readText to return */
export function __setClipboardContent(text: string): void {
  __clipboardContent = text;
}

/** Make executeCommand reject for a specific command */
export function __failCommand(cmd: string): void {
  __failingCommands.add(cmd);
}

/** Reset all tracking arrays */
export function __resetTracking(): void {
  __executeCommandCalls.length = 0;
  __executeCommandCallsWithArgs.length = 0;
  __clipboardWriteCalls.length = 0;
  __clipboardContent = '';
  __failingCommands.clear();
  window.activeTextEditor = undefined;
}

export const window = {
  createOutputChannel: () => ({
    appendLine: () => {},
    dispose: () => {},
  }),
  showInformationMessage: async () => undefined,
  showWarningMessage: async () => undefined,
  showErrorMessage: async () => undefined,
  showQuickPick: async () => undefined,
  activeTextEditor: undefined as any,
};

export const commands = {
  registerCommand: (_cmd: string, _cb: (...args: unknown[]) => unknown) => ({ dispose: () => {} }),
  executeCommand: async (cmd: string, ...args: any[]) => {
    if (__failingCommands.has(cmd)) {
      throw new Error(`Command failed: ${cmd}`);
    }
    __executeCommandCalls.push(cmd);
    __executeCommandCallsWithArgs.push({ cmd, args });
  },
};

export const env = {
  appName: 'Visual Studio Code',
  clipboard: {
    readText: async () => __clipboardContent,
    writeText: async (text: string) => { __clipboardWriteCalls.push(text); __clipboardContent = text; },
  },
};

export const Uri = {
  file: (path: string) => ({ fsPath: path, scheme: 'file' }),
};

export class Disposable {
  static from(...disposables: { dispose: () => any }[]) {
    return { dispose: () => disposables.forEach(d => d.dispose()) };
  }
  dispose() {}
}

export class EventEmitter {
  event = () => ({ dispose: () => {} });
  fire() {}
  dispose() {}
}

export class TreeItem {
  label?: string;
  collapsibleState?: number;
  description?: string;
  tooltip?: string;
  iconPath?: any;
  contextValue?: string;
  command?: any;
  constructor(label?: string, collapsibleState?: number) {
    this.label = label;
    this.collapsibleState = collapsibleState;
  }
}

export enum TreeItemCollapsibleState {
  None = 0,
  Collapsed = 1,
  Expanded = 2,
}

export class ThemeIcon {
  constructor(public id: string, public color?: any) {}
}

export class ThemeColor {
  constructor(public id: string) {}
}
