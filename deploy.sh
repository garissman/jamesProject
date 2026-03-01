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
PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"

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

# Copy Python source files into arduino-app/python
echo "Syncing Python files to arduino-app/python..."
for pyfile in settings.py pipetting_controller.py stepper_control.py stepper_control_arduino.py; do
    if [ -f "$PROJECT_ROOT/$pyfile" ]; then
        cp "$PROJECT_ROOT/$pyfile" "$LOCAL_APP_DIR/python/$pyfile"
    fi
done
cp "$PROJECT_ROOT/main.py" "$LOCAL_APP_DIR/python/server.py" 2>/dev/null || true
# Patch FRONTEND_DIST_DIR to point to ../assets (sibling to python/ on Arduino)
sed -i '' 's|FRONTEND_DIST_DIR = Path(__file__).parent / "frontend" / "dist"|FRONTEND_DIST_DIR = Path(__file__).parent.parent / "assets"|' "$LOCAL_APP_DIR/python/server.py"
# Set CONTROLLER_TYPE to arduino_uno_q in config.json for Arduino deployment
if [ -f "$LOCAL_APP_DIR/python/config.json" ]; then
    sed -i '' 's|"CONTROLLER_TYPE": *"[^"]*"|"CONTROLLER_TYPE": "arduino_uno_q"|' "$LOCAL_APP_DIR/python/config.json"
else
    echo '{"CONTROLLER_TYPE": "arduino_uno_q"}' > "$LOCAL_APP_DIR/python/config.json"
fi
echo "Python files synced."
echo ""

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
        spawn ssh -o StrictHostKeyChecking=no ${ARDUINO_USER}@${ARDUINO_IP} $1
        expect {
            \"password:\" { send \"${ARDUINO_PASS}\r\"; exp_continue }
            eof
        }
        lassign [wait] pid spawnid os_error value
        exit \$value
    "
}

# Helper: SCP a file or directory to Arduino via expect
scp_to() {
    local src="$1"
    local dst="$2"
    expect -c "
        set timeout 120
        spawn scp -O -r -o StrictHostKeyChecking=no ${src} ${ARDUINO_USER}@${ARDUINO_IP}:${dst}
        expect {
            \"password:\" { send \"${ARDUINO_PASS}\r\"; exp_continue }
            eof
        }
        lassign [wait] pid spawnid os_error value
        exit \$value
    "
}

echo "Step 1: Creating remote directory structure..."
ssh_cmd "mkdir -p ${REMOTE_DIR}/sketch ${REMOTE_DIR}/python ${REMOTE_DIR}/assets"

echo ""
echo "Step 2: Deploying app.yaml..."
scp_to "$LOCAL_APP_DIR/app.yaml" "$REMOTE_DIR/app.yaml"

echo ""
echo "Step 3: Deploying sketch..."
scp_to "$LOCAL_APP_DIR/sketch/" "$REMOTE_DIR/"

echo ""
echo "Step 4: Deploying Python files..."
scp_to "$LOCAL_APP_DIR/python/" "$REMOTE_DIR/"

echo ""
echo "Step 5: Deploying frontend assets..."
scp_to "$LOCAL_APP_DIR/assets/" "$REMOTE_DIR/"

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
