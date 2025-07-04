const vscode = require('vscode');
const path = require('path');

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

class FindAllOptions {
    constructor(context) {
        this.context = context;
        this.state = context.workspaceState;
        this.loadOptions();
    }

    loadOptions() {
        this.matchCase = this.state.get('findAll.matchCase', false);
        this.wholeWord = this.state.get('findAll.wholeWord', false);
        this.useRegex = this.state.get('findAll.useRegex', false);
        this.lastSearch = this.state.get('findAll.lastSearch', '');
        this.highlightColor = this.state.get('findAll.highlightColor', 'Default');
    }

    async showOptions() {
        const logger = new Logger(this.context);
        logger.log('showOptions called', {
            matchCase: this.matchCase,
            wholeWord: this.wholeWord,
            useRegex: this.useRegex,
            highlightColor: this.highlightColor
        });
        
        // Create a single QuickPick for both search term and options
        const quickPick = vscode.window.createQuickPick();
        quickPick.title = 'Find All Occurrences';
        quickPick.placeholder = 'Enter search term';
        quickPick.value = this.lastSearch;
        
        // Define option items with icons for better visibility
        const optionItems = [
            { label: '$(case-sensitive) Match Case', picked: this.matchCase, alwaysShow: true, id: 'matchCase' },
            { label: '$(text-size) Whole Word', picked: this.wholeWord, alwaysShow: true, id: 'wholeWord' },
            { label: '$(regex) Use Regular Expression', picked: this.useRegex, alwaysShow: true, id: 'useRegex' },
            { label: '$(symbol-color) Highlight: Default', picked: this.highlightColor === 'Default', alwaysShow: true, id: 'highlightDefault' },
            { label: '$(symbol-color) Highlight: Coral', picked: this.highlightColor === 'Coral', alwaysShow: true, id: 'highlightCoral' },
            { label: '$(symbol-color) Highlight: Pale Green', picked: this.highlightColor === 'Pale Green', alwaysShow: true, id: 'highlightPaleGreen' }
        ];
        
        // Pre-select the current options
        const preSelectedItems = optionItems.filter(item => item.picked);
        
        quickPick.items = optionItems;
        quickPick.selectedItems = preSelectedItems;
        quickPick.canSelectMany = true;
        
        // Show description text to guide the user
        quickPick.buttons = [
            {
                iconPath: new vscode.ThemeIcon('info'),
                tooltip: 'Enter search term above and select options below. Press Enter when done.'
            }
        ];
        
        logger.log('QuickPick created with options', { 
            items: optionItems,
            preSelected: preSelectedItems
        });
        
        return new Promise(resolve => {
            quickPick.onDidAccept(() => {
                const searchTerm = quickPick.value;
                const selectedOptions = quickPick.selectedItems;
                
                if (!searchTerm || searchTerm.trim() === '') {
                    vscode.window.showWarningMessage('Please enter a search term');
                    return;
                }
                
                logger.log('QuickPick accepted', { 
                    searchTerm,
                    selectedOptions 
                });
                
                // Update options based on selection
                this.matchCase = selectedOptions.some(o => o.id === 'matchCase');
                this.wholeWord = selectedOptions.some(o => o.id === 'wholeWord');
                this.useRegex = selectedOptions.some(o => o.id === 'useRegex');
                this.lastSearch = searchTerm;
                
                // Handle highlight color (ensure only one is selected)
                if (selectedOptions.some(o => o.id === 'highlightCoral')) {
                    this.highlightColor = 'Coral';
                } else if (selectedOptions.some(o => o.id === 'highlightPaleGreen')) {
                    this.highlightColor = 'Pale Green';
                } else {
                    this.highlightColor = 'Default';
                }
                
                // Save options to state
                this.state.update('findAll.matchCase', this.matchCase);
                this.state.update('findAll.wholeWord', this.wholeWord);
                this.state.update('findAll.useRegex', this.useRegex);
                this.state.update('findAll.lastSearch', this.lastSearch);
                this.state.update('findAll.highlightColor', this.highlightColor);
                
                quickPick.hide();
                resolve({ searchTerm, options: this });
            });
            
            quickPick.onDidHide(() => {
                logger.log('QuickPick hidden');
                resolve({ searchTerm: null, options: this });
            });
            
            quickPick.show();
            logger.log('QuickPick shown');
        });
    }
}

class Logger {
    constructor(context) {
        this.context = context;
        this.logs = context.globalState.get('findAll.logs', []);
        this.outputChannel = null;
    }

    safeStringify(obj) {
        const seen = new WeakSet();
        return JSON.stringify(obj, (key, value) => {
            if (typeof value === 'object' && value !== null) {
                if (seen.has(value)) return '[Circular]';
                seen.add(value);
            }
            return value;
        });
    }

    log(action, details = {}) {
        const entry = {
            timestamp: new Date().toISOString(),
            action,
            details: this.safeStringify(details)
        };
        this.logs.push(entry);
        this.context.globalState.update('findAll.logs', this.logs);
        
        const output = this.outputChannel || 
            (this.outputChannel = vscode.window.createOutputChannel('Find All Logs'));
        output.appendLine(`[${entry.timestamp}] ${action}: ${entry.details}`);
    }

    showLogs() {
        if (!this.outputChannel) {
            this.outputChannel = vscode.window.createOutputChannel('Find All Logs');
        }
        this.outputChannel.show();
    }
}

function activate(context) {
    const optionsManager = new FindAllOptions(context);
    const logger = new Logger(context);
    logger.log('Extension activated');
    
    let disposable = vscode.commands.registerCommand('vscode-find-all.findAll', async function () {
        const { searchTerm, options } = await optionsManager.showOptions();
        if (!searchTerm) return;
        
        // Create results panel
        const panel = vscode.window.createWebviewPanel(
            'findAllResults',
            'Find All Results',
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'media'))],
                enableCommandUris: true,
                contentOptions: {
                    allowScripts: true
                }
            }
        );

        // Find matches with options
        const matches = findMatchesInDocument(searchTerm, options);
        
        // Update panel with results and active options
        const csp = `<meta http-equiv="Content-Security-Policy" 
            content="default-src 'none'; 
            img-src ${panel.webview.cspSource} https:; 
            script-src ${panel.webview.cspSource} 'unsafe-inline';
            style-src ${panel.webview.cspSource} 'unsafe-inline';">`;
        panel.webview.html = `<!DOCTYPE html>
<html>
<head>
    ${csp}
    ${getWebviewContent(matches, searchTerm, options)}
</head>
<body>
</body>
</html>`;
        
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
        const decorationType = markDecorationTypes[options.highlightColor === 'Default' ? 0 : options.highlightColor === 'Coral' ? 1 : 2];
        
        editor.setDecorations(decorationType, matches.map(m => m.range));

        logger.log('Search performed', { 
            term: searchTerm, 
            options,
            matchCount: matches.length 
        });
    });

    context.subscriptions.push(disposable);
    context.subscriptions.push(
        vscode.commands.registerCommand('vscode-find-all.clearMarks', clearAllMarks)
    );

    // Add to activate function
    context.subscriptions.push(
        vscode.commands.registerCommand('vscode-find-all.toggleBookmark', () => {
            toggleBookmark();
            logger.log('Bookmark toggled', { line, file });
        }),
        vscode.commands.registerCommand('vscode-find-all.nextBookmark', () => navigateBookmarks(true)),
        vscode.commands.registerCommand('vscode-find-all.prevBookmark', () => navigateBookmarks(false)),
        vscode.commands.registerCommand('vscode-find-all.clearBookmarks', clearBookmarks),
        vscode.commands.registerCommand('vscode-find-all.showLogs', () => logger.showLogs())
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
    // More comprehensive regex escape function
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
        options.useRegex ? 'Regex' : '',
        options.highlightColor ? `Highlight: ${options.highlightColor}` : ''
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
        try {
            // Safely escape the match text
            const escapedMatch = escapeRegExp(matchText);
            
            // Create regex with try-catch for safety
            const regex = new RegExp(`(${escapedMatch})`, 'gi');
            return lineText.replace(regex, '<span class="match-highlight">$1</span>');
        } catch (error) {
            // If regex creation fails, fall back to a simple string replacement
            console.error('Regex error in highlightMatch:', error.message);
            
            // Simple fallback that doesn't use regex
            if (matchText && lineText.toLowerCase().includes(matchText.toLowerCase())) {
                return lineText.replace(matchText, '<span class="match-highlight">' + matchText + '</span>');
            }
            return lineText; // Return original if all else fails
        }
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
        ${summary}
        <div class="matches-container">
            ${matchesHtml}
        </div>
        ${script}
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
