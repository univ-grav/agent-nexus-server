# AgentNexus Server

A secure terminal sharing server that enables high-fidelity remote terminal access via WebSocket connections.

## Features

- **Secure Device Authentication**: Uses RSA-based device pairing with PIN verification.
- **High Fidelity**: Support for complex CLI tools (Vim, Top, AI CLI agents) with raw stdin piping.
- **Dynamic Sizing**: Real-time terminal dimension (cols/rows) synchronization between mobile and server.
- **mDNS Discovery**: Automatic service discovery on local networks (Zero-config).
- **Multi-Session Management**: Create, switch, and manage multiple independent terminal sessions.
- **Log Rotation**: Automatic multi-file log rotation and data cleanup.
- **Professional Distribution**: Built using Node.js SEA (Single Executable Application) for Mac and Linux.

## Installation

### One-liner Install (macOS/Linux)

```bash
curl -sL https://raw.githubusercontent.com/univ-grav/agent-nexus-server/main/scripts/install.sh | bash
```

### Manual Binary Installation

Download the pre-built binary from the [releases page](https://github.com/univ-grav/agent-nexus-server/releases):

```bash
# macOS
curl -sL https://github.com/univ-grav/agent-nexus-server/releases/download/v0.1.0/agent-nexus-macos-x64 -o /usr/local/bin/agent-nexus
chmod +x /usr/local/bin/agent-nexus

# Linux
curl -sL https://github.com/univ-grav/agent-nexus-server/releases/download/v0.1.0/agent-nexus-linux-x64 -o /usr/local/bin/agent-nexus
chmod +x /usr/local/bin/agent-nexus
```

### From Source

```bash
# Clone the repository
git clone https://github.com/univ-grav/agent-nexus-server.git
cd agent-nexus-server

# Install dependencies
npm install

# Start the server
node server.js
```

## Usage

**Start the server**:
```bash
agent-nexus
```

**Options**:
- `--port <number>` - Specify server port (default: 8080)

**Keyboard shortcuts** (when running server in local terminal):
- `Ctrl+R` - Refresh pairing PIN code
- `Ctrl+T` - Create new terminal session
- `Ctrl+S` - Switch between active local sessions
- `Ctrl+Q` - Stop and exit server

## Configuration

### Data Directory

User data is stored in `~/.agent-nexus/`:
- `trusted_devices.json`: Trusted device credentials
- `logs/`: Session logs (rotated automatically)

### Log Rotation

- Max file size: 5MB per log file
- Max rotated files: 5 per session
- Auto-clean: Logs older than 7 days are automatically cleaned

## Security

- Device pairing requires mandatory PIN verification.
- RSA public-key signature authentication for all subsequent connections.
- Secure environment isolation for PTY processes.

## Development

### Build Standalone Binary

This project uses **Node.js SEA** for creating single executable binaries.

```bash
# Install dependencies including esbuild
npm install

# Build binaries (Output in dist/ directory)
npm run build
```

## License

MIT
