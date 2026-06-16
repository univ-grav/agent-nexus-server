# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-06-16

### Added

- **Secure Core**: Secure terminal sharing with RSA-based device pairing and PIN-based secondary verification.
- **Service Discovery**: Built-in mDNS support for zero-config automatic discovery on local networks.
- **Multi-Session Management**: Support for creating, switching, and managing multiple independent terminal sessions.
- **Advanced Terminal UI**: Interactive server-side status bar with real-time session tracking and keyboard shortcuts.
- **Terminal Compatibility**: High-fidelity terminal emulation using raw stdin piping, supporting complex CLI tools like Vim and AI CLI agents.
- **Dynamic Sizing**: Real-time synchronization of terminal dimensions (cols/rows) between mobile devices and server PTY.
- **Automatic Sync**: Faithful raw data streaming to mobile clients ensuring 100% rendering accuracy.
- **Robust Distribution**: Modern Node.js SEA (Single Executable Application) bundling for Mac and Linux.
- **Maintenance**: Automated multi-file log rotation and data cleanup logic.
- **Professional Installer**: One-liner bash installer for easy cross-platform deployment.

### Changed

- Transitioned from `pkg` to `esbuild` + Node.js SEA for improved ESM support and performance.
- Optimized local keyboard shortcuts to use `Ctrl+Q` for exit, freeing up `Ctrl+C` for terminal applications.
