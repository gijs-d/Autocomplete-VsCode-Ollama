const vscode = require('vscode');
const path = require('path');

/**
 * A simple CompletionItemProvider that uses Ollama for suggestions.
 */
class OllamaCompletionProvider {
  async provideCompletionItems(document, position, token, context) {
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
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: ollamaModel,
          prompt: prompt,
          suffix: suffix + '/n',
          stream: false,
          options: {
            temperature: 0.01,
            num_predict: 256,
            stop: [
              '<|file_separator|>',
              '<|fim_prefix|>',
              '<|fim_suffix|>',
              '<|fim_middle|>',
              '\n\n',
              '\n',
            ],
            num_ctx: 32768,
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
          vscode.CompletionItemKind.Snippet
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
      return completionItems;
    } catch (error) {
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

  const provider = new OllamaCompletionProvider();
  const allAlphanumeric = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split(
    ''
  );
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      selector,
      provider,
      // ...allAlphanumeric,
      '.',
      ' ',
      '\n'
    )
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
