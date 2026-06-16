#!/bin/bash

set -e

BINARY_NAME="agent-nexus"
INSTALL_DIR="/usr/local/bin"
REPO="univ-grav/agent-nexus-server"

echo "Installing AgentNexus Server..."

# Get latest release version from GitHub API
echo "Checking for latest version..."
LATEST_VERSION=$(curl -sL "https://api.github.com/repos/$REPO/releases/latest" | grep -o '"tag_name": "v[^"]*"' | sed 's/"tag_name": "v\([^"]*\)"/\1/')

if [ -z "$LATEST_VERSION" ]; then
    echo "Error: Failed to get latest version"
    exit 1
fi

echo "Found latest version: v$LATEST_VERSION"

# Determine OS and download URL
if [[ "$(uname -s)" == "Darwin" ]]; then
    BINARY_URL="https://github.com/$REPO/releases/download/v$LATEST_VERSION/agent-nexus-macos-x64"
elif [[ "$(uname -s)" == "Linux" ]]; then
    BINARY_URL="https://github.com/$REPO/releases/download/v$LATEST_VERSION/agent-nexus-linux-x64"
else
    echo "Error: Unsupported OS"
    exit 1
fi

# Create temp directory
TMP_DIR=$(mktemp -d)
cd "$TMP_DIR"

# Download and install
echo "Downloading agent-nexus v$LATEST_VERSION..."
curl -sL "$BINARY_URL" -o "$BINARY_NAME"
chmod +x "$BINARY_NAME"

# Install to /usr/local/bin
echo "Installing to $INSTALL_DIR..."
sudo mv "$BINARY_NAME" "$INSTALL_DIR/"

# Cleanup
cd /
rm -rf "$TMP_DIR"

echo "AgentNexus Server v$LATEST_VERSION installed successfully!"
echo "Run 'agent-nexus' to start the server."