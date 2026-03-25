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

export const window = {
  createOutputChannel: () => ({
    appendLine: () => {},
    dispose: () => {},
  }),
  showInformationMessage: async () => undefined,
  showWarningMessage: async () => undefined,
  showErrorMessage: async () => undefined,
  showQuickPick: async () => undefined,
  activeTextEditor: undefined,
};

export const commands = {
  registerCommand: (_cmd: string, _cb: Function) => ({ dispose: () => {} }),
  executeCommand: async () => {},
};

export const env = {
  appName: 'Visual Studio Code',
  clipboard: {
    readText: async () => '',
    writeText: async () => {},
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
