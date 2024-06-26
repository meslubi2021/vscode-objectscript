import * as vscode from "vscode";
import { DocumentContentProvider } from "../providers/DocumentContentProvider";
import { currentFile, outputChannel } from "../utils";

export async function jumpToTagAndOffset(): Promise<void> {
  const file = currentFile();
  if (!file) {
    return;
  }
  const nameMatch = file.name.match(/(.*)\.(int|mac)$/i);
  if (!nameMatch) {
    vscode.window.showWarningMessage("Jump to Tag and Offset only supports .int and .mac routines.", "Dismiss");
    return;
  }
  const document = vscode.window.activeTextEditor?.document;
  if (!document) {
    return;
  }

  // Get the labels from the document symbol provider
  const map = new Map<string, number>();
  const symbols: vscode.DocumentSymbol[] = await vscode.commands.executeCommand(
    "vscode.executeDocumentSymbolProvider",
    document.uri
  );
  const items: vscode.QuickPickItem[] = symbols
    .filter((symbol) => symbol.kind === vscode.SymbolKind.Method)
    .map((symbol) => {
      map.set(symbol.name, symbol.range.start.line);
      return {
        label: symbol.name,
      };
    });
  const quickPick = vscode.window.createQuickPick();
  quickPick.title = "Jump to Tag + Offset";
  quickPick.items = items;
  quickPick.canSelectMany = false;
  quickPick.onDidChangeSelection((_) => {
    quickPick.value = quickPick.selectedItems[0].label;
  });
  quickPick.onDidAccept((_) => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      quickPick.hide();
      return;
    }
    const parts = quickPick.value.split("+");
    let offset = 0;
    if (!map.has(parts[0])) {
      if (parts[0] !== "") {
        return;
      }
    } else {
      offset += map.get(parts[0]);
    }
    if (parts.length > 1) {
      offset += parseInt(parts[1], 10);
    }
    const line = editor.document.lineAt(offset);
    const range = new vscode.Range(line.range.start, line.range.start);
    editor.selection = new vscode.Selection(range.start, range.start);
    editor.revealRange(range, vscode.TextEditorRevealType.AtTop);
    quickPick.hide();
  });
  quickPick.show();
}

/** Prompt the user for an error location of the form `label+offset^routine`, then open it. */
export async function openErrorLocation(): Promise<void> {
  // Prompt the user for a location
  const regex = /^(%?[\p{L}\d]+)?(?:\+(\d+))?\^(%?[\p{L}\d.]+)$/u;
  const location = await vscode.window.showInputBox({
    title: "Enter the location to open",
    ignoreFocusOut: true,
    placeHolder: "label+offset^routine",
    validateInput: (v) => (regex.test(v.trim()) ? undefined : "Input is not in the format 'label+offset^routine'"),
  });
  if (!location) {
    return;
  }
  const [, label, offset, routine] = location.trim().match(regex);
  // Get the uri for the routine
  const uri = DocumentContentProvider.getUri(`${routine}.int`);
  if (!uri) {
    return;
  }
  let selection = new vscode.Range(0, 0, 0, 0);
  try {
    if (label) {
      // Find the location of the tag within the document
      const symbols: vscode.DocumentSymbol[] = await vscode.commands.executeCommand(
        "vscode.executeDocumentSymbolProvider",
        uri
      );
      for (const symbol of symbols) {
        if (symbol.name == label) {
          selection = new vscode.Range(symbol.selectionRange.start.line, 0, symbol.selectionRange.start.line, 0);
          break;
        }
      }
    }
    if (offset) {
      // Add the offset
      selection = new vscode.Range(selection.start.line + Number(offset), 0, selection.start.line + Number(offset), 0);
    }
    // Show the document
    await vscode.window.showTextDocument(uri, { preview: false, selection });
  } catch (error) {
    outputChannel.appendLine(
      typeof error == "string" ? error : error instanceof Error ? error.message : JSON.stringify(error)
    );
    outputChannel.show(true);
    vscode.window.showErrorMessage(
      `Failed to open routine '${routine}.int'. Check 'ObjectScript' Output channel for details.`,
      "Dismiss"
    );
  }
}
