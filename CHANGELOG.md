# Change Log

All notable changes to the "autocomplete" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

- No changes since last release.

## [0.0.1] - 2025-08-01

### Added

- Initial release of the Ollama Autocomplete extension.
- Integration with local Ollama server for code suggestions.
- Support for multiple programming languages (JavaScript, TypeScript, Python, etc.).
- Customizable settings for Ollama host and model.
- Suggestions are now split by character delimiters and added to the standard VS Code dropdown suggestion list.
- Automatically closes open brackets and quotes at the end of a suggestion to maintain code integrity.

## [0.0.2] - 2025-08-23

### Added

- Filter out duplicate suggestions. 

## [0.0.4] - 2026-04-04

Added

    AI Commit Generator: Genereer Engelse commit-berichten met de nieuwe "Sparkle"-knop in het Git-paneel.
    AbortController: Stopt oude Ollama-taken direct zodra je verder typt (bespaart GPU).
    JSX/TSX Support: Volledige ondersteuning voor React-bestanden toegevoegd.

Changed

    Performance Fix: Context verlaagd naar 8k en temperature naar 0 voor snellere reacties op de RTX 3060.
    Dynamic Refresh: Popup ververst nu bij elke letter dankzij isIncomplete: true.
    Modulaire Code: Logica gesplitst in aparte providers voor Autocomplete en Git.

Fixed

    Sticking Popups: Suggesties blijven niet meer hangen als je een nieuw woord begint te typen.
