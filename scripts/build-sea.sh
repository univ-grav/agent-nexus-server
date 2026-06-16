#!/bin/bash
set -e

# Lock to project root directory
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# Configuration
APP_NAME="agent-nexus"
DIST_DIR="dist"
BUILD_DIR="build-tmp"
NODE_PATH=$(which node)

echo "🚀 Starting Node.js SEA build process..."

# 1. Clean and prepare directories
rm -rf $DIST_DIR $BUILD_DIR
mkdir -p $DIST_DIR $BUILD_DIR

# 2. Bundle the project using esbuild
echo "📦 Bundling with esbuild..."
./node_modules/.bin/esbuild server.js \
    --bundle \
    --platform=node \
    --target=node18 \
    --external:node-pty \
    --outfile=$BUILD_DIR/bundled.js

# 3. Create SEA configuration
echo "📝 Generating SEA config..."
cat <<EOF > $BUILD_DIR/sea-config.json
{
  "main": "$BUILD_DIR/bundled.js",
  "output": "$BUILD_DIR/sea-prep.blob"
}
EOF

# 4. Generate the SEA blob
echo "🔮 Generating SEA blob..."
$NODE_PATH --experimental-sea-config $BUILD_DIR/sea-config.json

# 5. Create the base binary
echo "🏗️  Creating base binary..."
cp $NODE_PATH $DIST_DIR/$APP_NAME

# 6. Inject the blob based on OS type
echo "💉 Injecting blob into binary..."
# Detect sentinel fuse (can vary by Node.js version/build)
SENTINEL=$(strings $NODE_PATH | grep -o 'NODE_SEA_FUSE_[a-f0-9]*' | head -n 1)

if [ -z "$SENTINEL" ]; then
    echo "❌ Error: Could not find NODE_SEA_FUSE sentinel in $NODE_PATH"
    exit 1
fi

echo "Detected sentinel: $SENTINEL"

if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "🍎 macOS detected - using Mach-O injection..."
    ./node_modules/.bin/postject $DIST_DIR/$APP_NAME NODE_SEA_BLOB $BUILD_DIR/sea-prep.blob \
        --sentinel-fuse $SENTINEL \
        --macho-segment-name NODE_SEA
    
    echo "🔏 Signing binary for macOS..."
    codesign -s - -f $DIST_DIR/$APP_NAME
else
    echo "🐧 Linux/Other detected - using standard injection..."
    ./node_modules/.bin/postject $DIST_DIR/$APP_NAME NODE_SEA_BLOB $BUILD_DIR/sea-prep.blob \
        --sentinel-fuse $SENTINEL
fi

# 7. Cleanup
rm -rf $BUILD_DIR

echo "✅ Build complete! Binary located at $DIST_DIR/$APP_NAME"
