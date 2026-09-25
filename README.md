# Find All Occurrences Extension for VS Code

Quickly search within the current file using VS Code's built-in search.

## Features

- Opens a dedicated Search Editor tab pre-configured to search only in the current file
- Uses all standard VS Code search options (Match Case, Whole Word, Regex)
- Does not modify the shared Search panel state
- `Cmd+'` (Mac) / `Ctrl+'` (Windows/Linux) runs "Find All Occurrences (.* Regex)": opens a live-search panel — type space-separated words and they are implicitly combined into a `word1.*word2` regex search across the workspace, with results refreshing as you type

## Usage

1. Open Command Palette (`Cmd+Shift+P` on Mac, `Ctrl+Shift+P` on Windows/Linux)
2. Type "Find All Occurrences" and select the command
3. VS Code's Search panel opens with the current file pre-filled
4. Enter your search term and use the built-in search options

## Requirements

- VS Code 1.75.0 or later

## Release Notes

### 2.0.0

- Simplified to use VS Code's built-in search
- Opens search panel scoped to current file

### 1.0.0

Initial release
