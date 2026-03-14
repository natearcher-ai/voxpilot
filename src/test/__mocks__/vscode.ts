// Minimal vscode mock for unit tests
export const workspace = {
  getConfiguration: () => ({
    get: (key: string, defaultVal?: any) => defaultVal,
    update: async () => {},
  }),
  onDidChangeConfiguration: () => ({ dispose: () => {} }),
};

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
