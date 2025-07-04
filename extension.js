const vscode = require('vscode');

// Store search options globally
let searchOptions = {
    matchCase: false,
    wholeWord: false,
    useRegex: false
};

let lastSearchTerm = '';
let activeDecorations = [];
const markDecorationTypes = [
    vscode.window.createTextEditorDecorationType({
        backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
        overviewRulerColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
        overviewRulerLane: vscode.OverviewRulerLane.Full
    }),
    vscode.window.createTextEditorDecorationType({
        backgroundColor: '#FFA07A',
        overviewRulerColor: '#FFA07A',
        overviewRulerLane: vscode.OverviewRulerLane.Full
    }),
    vscode.window.createTextEditorDecorationType({
        backgroundColor: '#98FB98',
        overviewRulerColor: '#98FB98',
        overviewRulerLane: vscode.OverviewRulerLane.Full
    })
];

// Add to global variables
let bookmarks = [];
const bookmarkDecorationType = vscode.window.createTextEditorDecorationType({
    gutterIconPath: vscode.Uri.file('bookmark-icon.svg'),
    gutterIconSize: 'contain',
    overviewRulerColor: 'rgba(0, 100, 255, 0.8)',
    overviewRulerLane: vscode.OverviewRulerLane.Right
});

function activate(context) {
    let disposable = vscode.commands.registerCommand('vscode-find-all.findAll', function () {
        // Create quick pick for search options
        const optionItems = [
            { label: 'Match Case', description: 'Case sensitive search', picked: searchOptions.matchCase },
            { label: 'Whole Word', description: 'Match whole words only', picked: searchOptions.wholeWord },
            { label: 'Use Regex', description: 'Use regular expressions', picked: searchOptions.useRegex }
        ];

        vscode.window.showQuickPick(optionItems, {
            placeHolder: 'Select search options (press Escape to skip)',
            canPickMany: true
        }).then(selectedOptions => {
            // Update search options
            searchOptions.matchCase = selectedOptions?.some(o => o.label === 'Match Case') || false;
            searchOptions.wholeWord = selectedOptions?.some(o => o.label === 'Whole Word') || false;
            searchOptions.useRegex = selectedOptions?.some(o => o.label === 'Use Regex') || false;

            // Then show input box for search term
            return vscode.window.showInputBox({
                placeHolder: 'Enter search term',
                prompt: 'Find all occurrences in current file',
                value: lastSearchTerm
            });
        }).then(searchTerm => {
            if (!searchTerm) return;
            lastSearchTerm = searchTerm;

            // Create results panel
            const panel = vscode.window.createWebviewPanel(
                'findAllResults',
                'Find All Results',
                vscode.ViewColumn.Beside,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true
                }
            );

            // Find matches with options
            const matches = findMatchesInDocument(searchTerm, searchOptions);
            
            // Update panel with results and active options
            panel.webview.html = getWebviewContent(matches, searchTerm, searchOptions);
            
            // Get active editor
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showErrorMessage('No active editor found');
                return;
            }

            // Handle message from webview
            panel.webview.onDidReceiveMessage(
                message => {
                    if (message.command === 'navigate') {
                        const line = message.line - 1;
                        const startCol = message.startCol;
                        const endCol = message.endCol;
                        
                        const startPos = new vscode.Position(line, startCol);
                        const endPos = new vscode.Position(line, endCol);
                        const range = new vscode.Range(startPos, endPos);
                        
                        editor.selection = new vscode.Selection(startPos, endPos);
                        editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
                    }
                },
                undefined,
                context.subscriptions
            );

            // Decorate matches in editor
            const decorationType = vscode.window.createTextEditorDecorationType({
                backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
                overviewRulerColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
                overviewRulerLane: vscode.OverviewRulerLane.Full
            });
            
            editor.setDecorations(decorationType, matches.map(m => m.range));

            // Add mark feature
            const markColor = vscode.window.showQuickPick([
                { label: 'Default', description: 'Use default highlight color' },
                { label: 'Coral', description: 'Light coral highlight' },
                { label: 'Pale Green', description: 'Pale green highlight' }
            ], {
                placeHolder: 'Select highlight color (press Escape for temporary highlight)'
            }).then(markColor => {
                const decorationType = markColor ? 
                    markDecorationTypes[markColor.label === 'Coral' ? 1 : markColor.label === 'Pale Green' ? 2 : 0] :
                    markDecorationTypes[0];

                // Apply decorations
                if (editor) {
                    editor.setDecorations(decorationType, matches.map(m => m.range));
                    if (markColor) {
                        activeDecorations.push({
                            decorationType,
                            ranges: matches.map(m => m.range)
                        });
                    }
                }
            });
        });
    });

    context.subscriptions.push(disposable);
    context.subscriptions.push(
        vscode.commands.registerCommand('vscode-find-all.clearMarks', clearAllMarks)
    );

    // Add to activate function
    context.subscriptions.push(
        vscode.commands.registerCommand('vscode-find-all.toggleBookmark', toggleBookmark),
        vscode.commands.registerCommand('vscode-find-all.nextBookmark', () => navigateBookmarks(true)),
        vscode.commands.registerCommand('vscode-find-all.prevBookmark', () => navigateBookmarks(false)),
        vscode.commands.registerCommand('vscode-find-all.clearBookmarks', clearBookmarks)
    );
}

function findMatchesInDocument(searchTerm, options) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return [];
    
    const document = editor.document;
    const text = document.getText();
    const matches = [];
    
    // Build regex flags
    let flags = 'g';
    if (!options.matchCase) flags += 'i';
    
    // Build regex pattern
    let pattern = searchTerm;
    if (options.useRegex) {
        pattern = searchTerm; // Use as-is for regex
    } else {
        pattern = escapeRegExp(searchTerm);
        if (options.wholeWord) {
            pattern = `\\b${pattern}\\b`;
        }
    }
    
    const regex = new RegExp(pattern, flags);
    let match;
    
    while ((match = regex.exec(text)) !== null) {
        const startPos = document.positionAt(match.index);
        const endPos = document.positionAt(match.index + match[0].length);
        const range = new vscode.Range(startPos, endPos);
        const line = document.lineAt(startPos.line);
        
        matches.push({
            range,
            lineNumber: startPos.line + 1,
            lineText: line.text.trim(),
            matchText: match[0]
        });
    }
    
    return matches;
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
}

function getWebviewContent(matches, searchTerm, options) {
    const styles = `
        <style>
            body {
                font-family: var(--vscode-font-family);
                padding: 0;
                margin: 0;
                color: var(--vscode-editor-foreground);
                background-color: var(--vscode-editor-background);
            }
            .header {
                padding: 10px;
                background-color: var(--vscode-editorWidget-background);
                border-bottom: 1px solid var(--vscode-editorWidget-border);
                position: sticky;
                top: 0;
                z-index: 1;
            }
            .summary {
                margin-bottom: 10px;
                font-weight: bold;
            }
            .options {
                font-size: 12px;
                color: var(--vscode-descriptionForeground);
                margin-bottom: 5px;
            }
            .matches-container {
                height: calc(100vh - 80px);
                overflow-y: auto;
            }
            .match {
                padding: 8px 10px;
                cursor: pointer;
                border-bottom: 1px solid var(--vscode-editor-lineHighlightBorder);
                display: flex;
            }
            .match:hover {
                background-color: var(--vscode-list-hoverBackground);
            }
            .line-number {
                color: var(--vscode-editorLineNumber-foreground);
                margin-right: 15px;
                min-width: 40px;
                text-align: right;
            }
            .match-text {
                flex-grow: 1;
            }
            .match-highlight {
                font-weight: bold;
                color: var(--vscode-editor-findMatchHighlightBackground);
            }
            .match-context {
                color: var(--vscode-descriptionForeground);
                font-size: 0.9em;
                margin-top: 3px;
            }
        </style>
    `;

    const script = `
        <script>
            const vscode = acquireVsCodeApi();
            function navigate(line, startCol, endCol) {
                vscode.postMessage({
                    command: 'navigate',
                    line: line,
                    startCol: startCol,
                    endCol: endCol
                });
            }
        </script>
    `;

    // Add options display to the summary
    const optionsText = [
        options.matchCase ? 'Match Case' : '',
        options.wholeWord ? 'Whole Word' : '',
        options.useRegex ? 'Regex' : ''
    ].filter(Boolean).join(' • ');
    
    const summary = `
        <div class="header">
            <div class="summary">Found ${matches.length} matches for "${searchTerm}"</div>
            ${optionsText ? `<div class="options">${optionsText}</div>` : ''}
        </div>
    `;
    
    const matchesHtml = matches.map(match => {
        const lineText = escapeHtml(match.lineText);
        const highlightedText = highlightMatch(lineText, match.matchText);
        const contextBefore = getMatchContext(match.lineText, match.matchText, 'before');
        const contextAfter = getMatchContext(match.lineText, match.matchText, 'after');
        
        return `
            <div class="match" onclick="navigate(${match.lineNumber}, ${match.range.start.character}, ${match.range.end.character})">
                <div class="line-number">${match.lineNumber}</div>
                <div class="match-text">
                    ${highlightedText}
                    ${contextBefore || contextAfter ? 
                        `<div class="match-context">
                            ${contextBefore}${contextAfter}
                        </div>` : 
                        ''}
                </div>
            </div>
        `;
    }).join('');

    function escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function highlightMatch(lineText, matchText) {
        const escapedMatch = escapeRegExp(matchText);
        const regex = new RegExp(`(${escapedMatch})`, 'gi');
        return lineText.replace(regex, '<span class="match-highlight">$1</span>');
    }

    function getMatchContext(lineText, matchText, position) {
        const index = lineText.indexOf(matchText);
        if (index === -1) return '';
        
        if (position === 'before') {
            const context = lineText.substring(0, index).trim();
            return context ? `${context} ` : '';
        } else {
            const context = lineText.substring(index + matchText.length).trim();
            return context ? ` ${context}` : '';
        }
    }

    return `
        <!DOCTYPE html>
        <html>
            <head>${styles}</head>
            <body>
                ${summary}
                <div class="matches-container">
                    ${matchesHtml}
                </div>
                ${script}
            </body>
        </html>
    `;
}

function clearAllMarks() {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
        activeDecorations.forEach(d => {
            editor.setDecorations(d.decorationType, []);
        });
        activeDecorations = [];
    }
}

// Add new functions
function toggleBookmark() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const lineNumber = editor.selection.active.line;
    const existingIndex = bookmarks.findIndex(b => b.line === lineNumber && b.file === editor.document.uri.fsPath);

    if (existingIndex >= 0) {
        bookmarks.splice(existingIndex, 1);
    } else {
        bookmarks.push({
            file: editor.document.uri.fsPath,
            line: lineNumber
        });
    }

    updateBookmarkDecorations();
}

function navigateBookmarks(forward = true) {
    const editor = vscode.window.activeTextEditor;
    if (!editor || bookmarks.length === 0) return;

    const currentLine = editor.selection.active.line;
    const currentFile = editor.document.uri.fsPath;
    
    let filtered = bookmarks.filter(b => b.file === currentFile);
    if (filtered.length === 0) filtered = bookmarks;
    
    let nextIndex = 0;
    if (forward) {
        nextIndex = filtered.findIndex(b => b.line > currentLine);
        if (nextIndex === -1) nextIndex = 0;
    } else {
        nextIndex = filtered.findIndex(b => b.line >= currentLine) - 1;
        if (nextIndex < 0) nextIndex = filtered.length - 1;
    }
    
    const bookmark = filtered[nextIndex];
    const position = new vscode.Position(bookmark.line, 0);
    
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(new vscode.Range(position, position));
}

function updateBookmarkDecorations() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    
    const currentFile = editor.document.uri.fsPath;
    const ranges = bookmarks
        .filter(b => b.file === currentFile)
        .map(b => new vscode.Range(b.line, 0, b.line, 0));
    
    editor.setDecorations(bookmarkDecorationType, ranges);
}

function clearBookmarks() {
    bookmarks = [];
    updateBookmarkDecorations();
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
}
