const vscode = require('vscode');
const path = require('path');
const { execSync } = require('child_process');
/**
 * A simple CompletionItemProvider that uses Ollama for suggestions.
 */
class OllamaCompletionProvider {
  async provideCompletionItems(document, position, token, context) {
    const controller = new AbortController();
    token.onCancellationRequested(() => {
      controller.abort();
      console.log('Ollama aanvraag afgebroken door gebruiker (verder getypt)');
    });

    const config = vscode.workspace.getConfiguration('autocompleter');
    const ollamaHost = config.get('ollamaHost', 'http://localhost:11434');
    const ollamaModel = config.get('ollamaModel', 'qwen2.5-coder:1.5b');
    const currentFileName = path.basename(document.fileName);
    const fullText = document.getText();
    const offset = document.offsetAt(position);

    const prefix = fullText.substring(0, offset);
    const suffix = fullText.substring(offset);

    const currentLineContent = document.lineAt(position).text;
    const currentLinePrefixToCursor = currentLineContent.substring(0, position.character);

    const prompt = `// ${currentFileName}\n${prefix}`;
    //console.log(prompt);

    const ollamaApiUrl = `${ollamaHost}/api/generate`;
    //console.log(ollamaModel);
    try {
      const response = await fetch(ollamaApiUrl, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: ollamaModel,
          prompt: prompt,
          suffix: suffix + '/n',
          stream: false,
          options: {
            temperature: 0,
            num_predict: 256,
            stop: [
              '<|file_separator|>',
              '<|fim_prefix|>',
              '<|fim_suffix|>',
              '<|fim_middle|>',
              '\n\n',
              '\n',
            ],
            num_ctx: 8192, //32768,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();

        vscode.window.showErrorMessage(`Ollama API error: ${response.status} - ${errorText}`);
        console.error(`Ollama API error: ${response.status} - ${errorText}`);
        return [];
      }

      const data = await response.json();

      // @ts-ignore
      const generatedText = data.response || '';
      console.log({ generatedText }, token.isCancellationRequested);

      if (token.isCancellationRequested) {
        return [];
      }

      const suggestions = this.splitSugestions(
        generatedText.split('\n')[0],
        currentLinePrefixToCursor.split(/\W+/g)?.at(-1)
      ).filter((suggestion, i, arr) => arr.indexOf(suggestion) === i);

      const completionItems = suggestions.map((suggestion) => {
        const completionItem = new vscode.CompletionItem(
          suggestion,
          vscode.CompletionItemKind.Text
        );

        completionItem.insertText = suggestion;
        completionItem.detail = 'autocomplete';
        completionItem.sortText = ' !' + suggestion;
        completionItem.documentation = new vscode.MarkdownString(
          `A nice sugestion by: \`${ollamaModel}\``
        );

        return completionItem;
      });

      console.log('suggestions', suggestions);
      return new vscode.CompletionList(completionItems, true);
      //return completionItems;
    } catch (error) {
      if (error.name === 'AbortError') {
        return [];
      }

      vscode.window.showErrorMessage(
        `Failed to connect to Ollama: ${error.message}. Please ensure Ollama is running and configured correctly.`
      );
      console.error('Failed to connect to Ollama:', error);
      return [];
    }
  }
  splitSugestions(suggestion, base = '') {
    let temp = '';
    let prefix = base;

    return suggestion
      .split(RegExp(/([\+\-\*\/\.\,\=\(\{\[\|\&\|\]\}\)\<\>\?\!\:])/))
      .reduce((acc, value, i, arr) => {
        if (value.length <= 1 && i < arr.length - 1) {
          temp += value;
        } else {
          acc.push(this.addClosingChars(prefix + temp + value));
          prefix += temp + value;
          temp = '';
        }
        return acc;
      }, []);
  }

  addClosingChars(text) {
    const stack = [];

    const openToCloseMap = { '(': ')', '{': '}', '[': ']' };
    const closeToOpenMap = { ')': '(', '}': '{', ']': '[' };
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let inBacktick = false;

    for (const char of text) {
      if (char === "'" && !inDoubleQuote && !inBacktick) {
        inSingleQuote = !inSingleQuote;
      } else if (char === '"' && !inSingleQuote && !inBacktick) {
        inDoubleQuote = !inDoubleQuote;
      } else if (char === '`' && !inDoubleQuote && !inSingleQuote) {
        inBacktick = !inBacktick;
      }
      if (!inSingleQuote && !inDoubleQuote && !inBacktick) {
        if (openToCloseMap[char]) {
          stack.push(char);
        } else if (closeToOpenMap[char]) {
          if (stack.length && stack.at(-1) === closeToOpenMap[char]) {
            stack.pop();
          }
        }
      }
    }

    let closeChars = '';
    closeChars += inSingleQuote ? "'" : inDoubleQuote ? '"' : inBacktick ? '`' : '';
    closeChars += stack
      .map((s) => openToCloseMap[s])
      .toReversed()
      .join('');
    return text + closeChars;
  }
}

class OllamaGitProvider {
  async generateCommitMessage(uri) {
    try {
      const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
      if (!gitExtension) return vscode.window.showErrorMessage('Git extensie niet gevonden.');

      const git = gitExtension.getAPI(1);
      // We pakken de eerste repository die open staat
   let repo;
    if (uri && uri.rootUri) {
      repo = git.repositories.find(r => r.rootUri.toString() === uri.rootUri.toString());
    } else {
      repo = git.repositories[0];
    }

      const projectRoot = repo.rootUri.fsPath;
      let diff = '';

      try {
        diff = execSync('git diff --cached', { cwd: projectRoot }).toString();
      } catch (e) {
        return vscode.window.showErrorMessage('Kon git diff niet uitvoeren.');
      }

      if (!diff)
        return vscode.window.showInformationMessage(
          'Stage eerst je wijzigingen (+) om een bericht te genereren.'
        );

      const config = vscode.workspace.getConfiguration('autocompleter');

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Ollama schrijft commit bericht...',
          cancellable: false,
        },
        async () => {
          const response = await fetch(`${config.get('ollamaHost')}/api/generate`, {
            method: 'POST',
            body: JSON.stringify({
              model: config.get('ollamaModel'),
              prompt: `Write a concise, professional commit message in the 'conventional commits' style (e.g., feat: add login, fix: resolved crash) based on the following diff. Use only one line and do not include any other text or explanations:\n\n${diff}`,
              stream: false,
              options: {
                temperature: 0.5,
                num_ctx: 8192,
              },
            }),
          });

          const data = await response.json();
          repo.inputBox.value = data.response.trim();
        }
      );
    } catch (err) {
      vscode.window.showErrorMessage('Fout bij genereren: ' + err.message);
    }
  }
}

/**
 * This method is called when your extension is activated.
 * The extension is activated the very first time the command is executed.
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  console.log('Congratulations, your extension "ollama-autocomplete-js" is now active!');

  const selector = [
    { scheme: 'file', language: 'typescript' },
    { scheme: 'file', language: 'javascript' },
    { scheme: 'file', language: 'python' },
    { scheme: 'file', language: 'java' },
    { scheme: 'file', language: 'javascriptreact' },
    { scheme: 'file', language: 'typescriptreact' },
    { scheme: 'file', language: 'html' },
    { scheme: 'file', language: 'css' },
    { scheme: 'file', language: 'json' },
    { scheme: 'file', language: 'txt' },
  ];

  // --- 1. Autocomplete Registratie ---
  const provider = new OllamaCompletionProvider();
  const allAlphanumeric = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split(
    ''
  );
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      selector,
      provider,
      ...allAlphanumeric,
      '.',
      ' ',
      '\n'
    )
  );
  // 2. Registreer Git Commit Commando
  const gitProvider = new OllamaGitProvider();
  context.subscriptions.push(
    vscode.commands.registerCommand('autocompleter.generateCommit', (uri) => {
      gitProvider.generateCommitMessage(uri);
    })
  );
}

/**
 * This method is called when your extension is deactivated.
 */
function deactivate() {
  console.log('Extension "ollama-autocomplete-js" is deactivated.');
}

module.exports = {
  activate,
  deactivate,
};
