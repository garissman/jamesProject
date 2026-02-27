#!/bin/bash
# Deploy jamesProject as Arduino Lab App to Arduino UNO Q
#
# Usage: ./deploy.sh [arduino_ip] [password]
#   arduino_ip  - IP address of Arduino (default: 192.168.12.172)
#   password    - SSH password (default: arduino)

set -e

ARDUINO_IP="${1:-192.168.12.172}"
ARDUINO_PASS="${2:-arduino}"
ARDUINO_USER="arduino"
REMOTE_DIR="/home/arduino/ArduinoApps/jamesproject"
LOCAL_APP_DIR="$(cd "$(dirname "$0")/arduino-app" && pwd)"

echo "========================================="
echo " Deploy JamesProject to Arduino Lab App"
echo "========================================="
echo "Target: ${ARDUINO_USER}@${ARDUINO_IP}:${REMOTE_DIR}"
echo "Source: ${LOCAL_APP_DIR}"
echo ""

# Check that arduino-app directory exists
if [ ! -d "$LOCAL_APP_DIR" ]; then
    echo "ERROR: arduino-app directory not found at $LOCAL_APP_DIR"
    exit 1
fi

# Check that assets are built
if [ ! -f "$LOCAL_APP_DIR/assets/index.html" ]; then
    echo "Frontend not built. Building now..."
    cd "$(dirname "$0")/frontend"
    npm run build
    cp -r dist/* "$LOCAL_APP_DIR/assets/"
    cd -
fi

# Helper: run command on Arduino via expect-based SSH
ssh_cmd() {
    expect -c "
        set timeout 30
        spawn ssh -o StrictHostKeyChecking=no ${ARDUINO_USER}@${ARDUINO_IP} \"$1\"
        expect {
            \"password:\" { send \"${ARDUINO_PASS}\r\"; exp_continue }
            eof
        }
    "
}

# Helper: SCP a file or directory to Arduino via expect
scp_to() {
    local src="$1"
    local dst="$2"
    local flags="${3:--r}"
    expect -c "
        set timeout 120
        spawn scp ${flags} -o StrictHostKeyChecking=no \"${src}\" ${ARDUINO_USER}@${ARDUINO_IP}:\"${dst}\"
        expect {
            \"password:\" { send \"${ARDUINO_PASS}\r\"; exp_continue }
            eof
        }
    "
}

echo "Step 1: Creating remote directory structure..."
ssh_cmd "mkdir -p ${REMOTE_DIR}/{sketch,python,assets}"

echo ""
echo "Step 2: Deploying app.yaml..."
scp_to "$LOCAL_APP_DIR/app.yaml" "$REMOTE_DIR/app.yaml" "-r"

echo ""
echo "Step 3: Deploying sketch..."
scp_to "$LOCAL_APP_DIR/sketch/" "$REMOTE_DIR/sketch/"

echo ""
echo "Step 4: Deploying Python files..."
scp_to "$LOCAL_APP_DIR/python/" "$REMOTE_DIR/python/"

echo ""
echo "Step 5: Deploying frontend assets..."
scp_to "$LOCAL_APP_DIR/assets/" "$REMOTE_DIR/assets/"

echo ""
echo "========================================="
echo " Deployment complete!"
echo "========================================="
echo ""
echo "To verify:"
echo "  ssh ${ARDUINO_USER}@${ARDUINO_IP}"
echo "  cd ${REMOTE_DIR}/python && python3 server.py"
echo ""
echo "Then open: http://${ARDUINO_IP}:8000"
