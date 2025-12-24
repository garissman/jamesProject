/*
 * Stepper Motor Controller for Arduino UNO Q (STM32U585 MCU)
 * Laboratory Sampler - 4 Stepper Motor Control with Limit Switches
 *
 * Visual Feedback System:
 * - 8x13 Blue LED Matrix: Progress bars, motor indicators, patterns
 * - RGB LED 3 & 4 (MCU): Color-coded status (active-low)
 * - Built-in LED: Fallback status indicator
 *
 * Status Colors (RGB LEDs):
 * - Idle: Green breathing
 * - Moving: Blue pulsing
 * - Homing: Yellow/Orange
 * - Error: Red flashing
 * - Success: Green flash
 *
 * Receives JSON commands via Serial from the Linux MPU
 * Controls stepper motors using DRV8825/A4988 drivers
 *
 * Pin Configuration (JDIGITAL Header):
 * Motor 1 (X-axis): Pulse=D2, Dir=D3, Limit=D10
 * Motor 2 (Y-axis): Pulse=D4, Dir=D5, Limit=D11
 * Motor 3 (Z-axis): Pulse=D6, Dir=D7, Limit=D12
 * Motor 4 (Pipette): Pulse=D8, Dir=D9, Limit=D13
 *
 * Limit switches are normally open (NO), connected between pin and GND
 * Internal pull-up resistors are enabled (HIGH = not triggered, LOW = triggered)
 */

#include <ArduinoJson.h>
#include <ArduinoGraphics.h>
#include <Arduino_LED_Matrix.h>
#include <Arduino_RouterBridge.h>

// Number of motors
#define NUM_MOTORS 4

// ============== LED Matrix Configuration ==============
// 8 rows x 13 columns (104 LEDs) - Arduino UNO Q matrix
ArduinoLEDMatrix matrix;

// Matrix dimensions (8 rows x 13 columns = 104 LEDs)
#define MATRIX_ROWS 8
#define MATRIX_COLS 13

// Frame buffer for LED matrix - flat array for draw() function
uint8_t matrixFrame[MATRIX_ROWS * MATRIX_COLS];

// ============== MCU RGB LED Configuration ==============
// RGB LED 3 & 4 are defined in variant.h:
// LED3_R, LED3_G, LED3_B, LED4_R, LED4_G, LED4_B
// Active-low: LOW = ON, HIGH = OFF
#define RGB_ON LOW
#define RGB_OFF HIGH

// Flag to enable/disable RGB LEDs (set to false if pins not available)
// Disabled for now - may cause issues on some UNO Q boards
#define ENABLE_RGB_LEDS false

// ============== Built-in LED (fallback) ==============
#define STATUS_LED LED_BUILTIN
#define LED_ON HIGH
#define LED_OFF LOW

// Debug flag
#define DEBUG_SERIAL true

// LED Animation States
enum LedState {
  LED_IDLE,
  LED_MOVING,
  LED_HOMING,
  LED_ERROR,
  LED_SUCCESS,
  LED_MOTOR_X,
  LED_MOTOR_Y,
  LED_MOTOR_Z,
  LED_MOTOR_P
};

LedState currentLedState = LED_IDLE;
unsigned long lastLedUpdate = 0;
int ledBrightness = 0;
int ledDirection = 1;
bool ledOn = false;
int ledBlinkCount = 0;
int currentMotorActive = -1;
int progressPercent = 0;

// Forward declarations
void setLedState(LedState state);
void initRgbLeds();
void setRgbColor(int ledNum, uint8_t r, uint8_t g, uint8_t b);
void clearMatrix();
void updateMatrixDisplay();
void showMotorIndicator(int motorIndex, bool active);
void showProgressBar(int percent);
void showIdlePattern();
void showErrorPattern();
void showSuccessPattern();

// Motor pin definitions
struct MotorConfig {
  int pulsePin;
  int dirPin;
  int limitPin;
  bool initialized;
  bool limitTriggered;
};

// Default motor pin configuration
MotorConfig motors[NUM_MOTORS] = {
  {2, 3, 10, false, false},   // Motor 1 (X-axis)
  {4, 5, 11, false, false},   // Motor 2 (Y-axis)
  {6, 7, 12, false, false},   // Motor 3 (Z-axis)
  {8, 9, 13, false, false}    // Motor 4 (Pipette)
};

// JSON document for parsing commands
StaticJsonDocument<512> docIn;
StaticJsonDocument<512> docOut;

// Buffer for serial input
String inputBuffer = "";
bool inputComplete = false;

// Limit switch debounce
unsigned long lastLimitCheck = 0;
const unsigned long LIMIT_DEBOUNCE_MS = 5;

void setup() {
  // Initialize LED Matrix FIRST - this is the most reliable indicator
  matrix.begin();

  // Immediate visual feedback - fill entire matrix
  memset(matrixFrame, 1, sizeof(matrixFrame));
  matrix.draw(matrixFrame);
  delay(500);

  // Initialize Bridge and Monitor for MPU communication
  if (!Bridge.begin()) {
    showErrorPattern();
    while(1); // Halt on bridge init failure
  }

  if (!Monitor.begin()) {
    showErrorPattern();
    while(1); // Halt on monitor init failure
  }

  // Initialize status LED (fallback)
  pinMode(STATUS_LED, OUTPUT);
  digitalWrite(STATUS_LED, LED_OFF);

  // Initialize RGB LEDs (if enabled)
  initRgbLeds();

  // Startup animation - sweep across matrix
  for (int col = 0; col < MATRIX_COLS; col++) {
    clearMatrix();
    for (int row = 0; row < MATRIX_ROWS; row++) {
      setPixel(row, col, 1);
    }
    updateMatrixDisplay();
    delay(50);
  }

  // Initialize all motor pins
  for (int i = 0; i < NUM_MOTORS; i++) {
    initMotor(i);
  }

  // Success indication - checkmark pattern
  showSuccessPattern();
  delay(1000);

  // Set to idle state
  currentLedState = LED_IDLE;

  // Send ready message
  sendResponse("ready", "Stepper controller initialized with LED matrix");
}

void loop() {
  // Update LED animation based on current state
  updateLedAnimation();

  // Check for monitor input (from MPU via Bridge)
  while (Monitor.available()) {
    char c = Monitor.read();
    if (c == '\n') {
      inputComplete = true;
    } else {
      inputBuffer += c;
    }
  }

  // Process complete command
  if (inputComplete) {
    processCommand(inputBuffer);
    inputBuffer = "";
    inputComplete = false;
  }

  // Periodically update limit switch states
  if (millis() - lastLimitCheck >= LIMIT_DEBOUNCE_MS) {
    updateLimitSwitches();
    lastLimitCheck = millis();
  }
}

// ============== RGB LED Functions ==============

void initRgbLeds() {
#if ENABLE_RGB_LEDS
  // Initialize RGB LED 3 pins (defined in variant.h)
  pinMode(LED3_R, OUTPUT);
  pinMode(LED3_G, OUTPUT);
  pinMode(LED3_B, OUTPUT);

  // Initialize RGB LED 4 pins
  pinMode(LED4_R, OUTPUT);
  pinMode(LED4_G, OUTPUT);
  pinMode(LED4_B, OUTPUT);

  // Turn off all (active-low, so HIGH = off)
  digitalWrite(LED3_R, RGB_OFF);
  digitalWrite(LED3_G, RGB_OFF);
  digitalWrite(LED3_B, RGB_OFF);
  digitalWrite(LED4_R, RGB_OFF);
  digitalWrite(LED4_G, RGB_OFF);
  digitalWrite(LED4_B, RGB_OFF);
#endif
}

void setRgbColor(int ledNum, uint8_t r, uint8_t g, uint8_t b) {
#if ENABLE_RGB_LEDS
  // Convert 0-255 to on/off (simple threshold) - active low
  // For PWM support, use analogWrite if available
  if (ledNum == 3) {
    digitalWrite(LED3_R, r > 127 ? RGB_ON : RGB_OFF);
    digitalWrite(LED3_G, g > 127 ? RGB_ON : RGB_OFF);
    digitalWrite(LED3_B, b > 127 ? RGB_ON : RGB_OFF);
  } else if (ledNum == 4) {
    digitalWrite(LED4_R, r > 127 ? RGB_ON : RGB_OFF);
    digitalWrite(LED4_G, g > 127 ? RGB_ON : RGB_OFF);
    digitalWrite(LED4_B, b > 127 ? RGB_ON : RGB_OFF);
  }
#endif
}

void setRgbOff(int ledNum) {
  setRgbColor(ledNum, 0, 0, 0);
}

// ============== LED Matrix Functions ==============

// Helper to set a pixel in the flat frame buffer
inline void setPixel(int row, int col, uint8_t value) {
  if (row >= 0 && row < MATRIX_ROWS && col >= 0 && col < MATRIX_COLS) {
    matrixFrame[row * MATRIX_COLS + col] = value;
  }
}

// Helper to get a pixel from the flat frame buffer
inline uint8_t getPixel(int row, int col) {
  if (row >= 0 && row < MATRIX_ROWS && col >= 0 && col < MATRIX_COLS) {
    return matrixFrame[row * MATRIX_COLS + col];
  }
  return 0;
}

void clearMatrix() {
  memset(matrixFrame, 0, sizeof(matrixFrame));
}

void updateMatrixDisplay() {
  // Use draw() with the flat array
  matrix.draw(matrixFrame);
}

void showProgressBar(int percent) {
  clearMatrix();

  // Calculate how many columns to fill (0-13 based on percent)
  int filledCols = (percent * MATRIX_COLS) / 100;

  // Fill the progress bar (rows 2-5 for a centered bar)
  for (int col = 0; col < filledCols; col++) {
    for (int row = 2; row < 6; row++) {
      setPixel(row, col, 1);
    }
  }

  // Add border dots at ends
  setPixel(1, 0, 1);
  setPixel(6, 0, 1);
  setPixel(1, MATRIX_COLS-1, 1);
  setPixel(6, MATRIX_COLS-1, 1);

  updateMatrixDisplay();
}

void showMotorIndicator(int motorIndex, bool active) {
  // Show which motor is active in the bottom row
  // Motor positions: X=cols 0-3, Y=cols 3-6, Z=cols 6-9, P=cols 9-12
  clearMatrix();

  int startCol = motorIndex * 3;

  if (active) {
    // Show filled block for active motor
    for (int row = 5; row < 8; row++) {
      for (int col = startCol; col < startCol + 3 && col < MATRIX_COLS; col++) {
        setPixel(row, col, 1);
      }
    }

    // Show motor letter above (X, Y, Z, P patterns)
    // Row 0-4 for letter indication
    switch (motorIndex) {
      case 0: // X pattern
        setPixel(1, startCol, 1);
        setPixel(1, startCol+2, 1);
        setPixel(2, startCol+1, 1);
        setPixel(3, startCol, 1);
        setPixel(3, startCol+2, 1);
        break;
      case 1: // Y pattern
        setPixel(1, startCol, 1);
        setPixel(1, startCol+2, 1);
        setPixel(2, startCol+1, 1);
        setPixel(3, startCol+1, 1);
        break;
      case 2: // Z pattern
        setPixel(1, startCol, 1);
        setPixel(1, startCol+1, 1);
        setPixel(1, startCol+2, 1);
        setPixel(2, startCol+1, 1);
        setPixel(3, startCol, 1);
        setPixel(3, startCol+1, 1);
        setPixel(3, startCol+2, 1);
        break;
      case 3: // P pattern (Pipette)
        setPixel(1, startCol, 1);
        setPixel(1, startCol+1, 1);
        setPixel(2, startCol, 1);
        setPixel(2, startCol+1, 1);
        setPixel(3, startCol, 1);
        break;
    }
  }

  updateMatrixDisplay();
}

void showIdlePattern() {
  // Breathing dots pattern
  static int idlePhase = 0;
  clearMatrix();

  // Center dot breathing
  int centerRow = MATRIX_ROWS / 2;
  int centerCol = MATRIX_COLS / 2;

  // Expanding/contracting circle pattern
  int radius = (idlePhase % 4);
  for (int dr = -radius; dr <= radius; dr++) {
    for (int dc = -radius; dc <= radius; dc++) {
      int r = centerRow + dr;
      int c = centerCol + dc;
      if (abs(dr) + abs(dc) == radius) {  // Diamond shape
        setPixel(r, c, 1);
      }
    }
  }

  idlePhase++;
  updateMatrixDisplay();
}

void showErrorPattern() {
  // X pattern for error
  clearMatrix();

  for (int i = 0; i < min(MATRIX_ROWS, MATRIX_COLS); i++) {
    setPixel(i, i, 1);
    setPixel(i, MATRIX_COLS - 1 - i, 1);
  }

  updateMatrixDisplay();
}

void showSuccessPattern() {
  // Checkmark pattern
  clearMatrix();

  // Draw checkmark
  setPixel(5, 2, 1);
  setPixel(6, 3, 1);
  setPixel(7, 4, 1);
  setPixel(6, 5, 1);
  setPixel(5, 6, 1);
  setPixel(4, 7, 1);
  setPixel(3, 8, 1);
  setPixel(2, 9, 1);

  updateMatrixDisplay();
}

void showHomingPattern(int motorIndex) {
  // Animated arrows pointing to home
  static int homingPhase = 0;
  clearMatrix();

  // Show motor indicator at bottom
  int startCol = motorIndex * 3;
  for (int col = startCol; col < startCol + 3 && col < MATRIX_COLS; col++) {
    setPixel(7, col, 1);
  }

  // Animated arrow pointing left (toward home)
  int arrowCol = (homingPhase % 8) + 2;
  setPixel(3, arrowCol, 1);
  setPixel(2, arrowCol - 1, 1);
  setPixel(4, arrowCol - 1, 1);
  setPixel(1, arrowCol - 2, 1);
  setPixel(5, arrowCol - 2, 1);

  homingPhase++;
  updateMatrixDisplay();
}

// ============== LED Animation Functions ==============

void setLedState(LedState state) {
  currentLedState = state;
  lastLedUpdate = millis();
  ledBlinkCount = 0;

  // Immediate visual feedback based on state
  switch (state) {
    case LED_SUCCESS:
      // Quick success flash on RGB and matrix
      setRgbColor(3, 0, 255, 0);  // Green
      setRgbColor(4, 0, 255, 0);
      showSuccessPattern();
      for (int i = 0; i < 3; i++) {
        digitalWrite(STATUS_LED, LED_ON);
        delay(100);
        digitalWrite(STATUS_LED, LED_OFF);
        delay(100);
      }
      currentLedState = LED_IDLE;
      break;

    case LED_ERROR:
      setRgbColor(3, 255, 0, 0);  // Red
      setRgbColor(4, 255, 0, 0);
      showErrorPattern();
      break;

    case LED_MOVING:
      setRgbColor(3, 0, 0, 255);  // Blue
      setRgbColor(4, 0, 0, 255);
      break;

    case LED_HOMING:
      setRgbColor(3, 255, 255, 0);  // Yellow
      setRgbColor(4, 255, 128, 0);  // Orange
      break;

    case LED_IDLE:
      setRgbColor(3, 0, 255, 0);  // Green
      setRgbColor(4, 0, 128, 0);  // Dim green
      break;

    default:
      break;
  }
}

void setMotorActive(int motorIndex) {
  currentMotorActive = motorIndex;
  showMotorIndicator(motorIndex, true);

  // Set specific color based on motor
  switch (motorIndex) {
    case 0: // X - Red tint
      setRgbColor(3, 255, 0, 128);
      break;
    case 1: // Y - Green tint
      setRgbColor(3, 0, 255, 128);
      break;
    case 2: // Z - Blue tint
      setRgbColor(3, 128, 0, 255);
      break;
    case 3: // Pipette - Cyan
      setRgbColor(3, 0, 255, 255);
      break;
  }
}

void updateProgress(int percent) {
  progressPercent = percent;
  showProgressBar(percent);
}

void updateLedAnimation() {
  unsigned long now = millis();

  switch (currentLedState) {
    case LED_IDLE:
      // Slow blink (500ms) with idle pattern
      if (now - lastLedUpdate >= 500) {
        lastLedUpdate = now;
        ledOn = !ledOn;
        digitalWrite(STATUS_LED, ledOn ? LED_ON : LED_OFF);
        showIdlePattern();
        // Toggle dim green
        if (ledOn) {
          setRgbColor(3, 0, 255, 0);
          setRgbColor(4, 0, 128, 0);
        } else {
          setRgbColor(3, 0, 128, 0);
          setRgbColor(4, 0, 255, 0);
        }
      }
      break;

    case LED_MOVING:
      // Fast blink (100ms)
      if (now - lastLedUpdate >= 100) {
        lastLedUpdate = now;
        ledOn = !ledOn;
        digitalWrite(STATUS_LED, ledOn ? LED_ON : LED_OFF);
        // Pulse blue
        if (ledOn) {
          setRgbColor(3, 0, 0, 255);
          setRgbColor(4, 0, 128, 255);
        } else {
          setRgbColor(3, 0, 128, 255);
          setRgbColor(4, 0, 0, 255);
        }
      }
      break;

    case LED_HOMING:
      // Double blink pattern with homing animation
      if (now - lastLedUpdate >= 150) {
        lastLedUpdate = now;
        ledBlinkCount++;
        if (ledBlinkCount <= 2) {
          ledOn = !ledOn;
        } else if (ledBlinkCount == 4) {
          ledBlinkCount = 0;
        }
        digitalWrite(STATUS_LED, ledOn ? LED_ON : LED_OFF);
        if (currentMotorActive >= 0) {
          showHomingPattern(currentMotorActive);
        }
      }
      break;

    case LED_ERROR:
      // Rapid flash (50ms) with error pattern
      if (now - lastLedUpdate >= 50) {
        lastLedUpdate = now;
        ledOn = !ledOn;
        digitalWrite(STATUS_LED, ledOn ? LED_ON : LED_OFF);
        if (ledOn) {
          setRgbColor(3, 255, 0, 0);
          setRgbColor(4, 255, 0, 0);
          showErrorPattern();
        } else {
          setRgbOff(3);
          setRgbOff(4);
          clearMatrix();
          updateMatrixDisplay();
        }
      }
      break;

    default:
      break;
  }
}

void ledPulseOnStep() {
  // Quick pulse during each step
  static bool stepLedState = false;
  stepLedState = !stepLedState;
  digitalWrite(STATUS_LED, stepLedState ? LED_ON : LED_OFF);
}

// ============== Motor Functions ==============

void initMotor(int motorIndex) {
  if (motorIndex < 0 || motorIndex >= NUM_MOTORS) return;

  // Initialize pulse and direction pins
  pinMode(motors[motorIndex].pulsePin, OUTPUT);
  pinMode(motors[motorIndex].dirPin, OUTPUT);
  digitalWrite(motors[motorIndex].pulsePin, LOW);
  digitalWrite(motors[motorIndex].dirPin, LOW);

  // Initialize limit switch pin with internal pull-up
  pinMode(motors[motorIndex].limitPin, INPUT_PULLUP);

  motors[motorIndex].initialized = true;
  motors[motorIndex].limitTriggered = false;
}

void updateLimitSwitches() {
  for (int i = 0; i < NUM_MOTORS; i++) {
    if (motors[i].initialized) {
      // LOW = triggered (switch closed to GND)
      motors[i].limitTriggered = (digitalRead(motors[i].limitPin) == LOW);
    }
  }
}

bool isLimitTriggered(int motorIndex) {
  if (motorIndex < 0 || motorIndex >= NUM_MOTORS) return true;
  // Read current state (LOW = triggered)
  return digitalRead(motors[motorIndex].limitPin) == LOW;
}

void processCommand(String& input) {
  // Parse JSON
  DeserializationError error = deserializeJson(docIn, input);

  if (error) {
    setLedState(LED_ERROR);
    sendError("JSON parse error");
    return;
  }

  const char* cmd = docIn["cmd"];
  if (!cmd) {
    setLedState(LED_ERROR);
    sendError("Missing command");
    return;
  }

  // Route command
  if (strcmp(cmd, "init_motor") == 0) {
    cmdInitMotor();
  }
  else if (strcmp(cmd, "step") == 0) {
    cmdStep();
  }
  else if (strcmp(cmd, "stop") == 0) {
    cmdStop();
  }
  else if (strcmp(cmd, "stop_all") == 0) {
    cmdStopAll();
  }
  else if (strcmp(cmd, "home_all") == 0) {
    cmdHomeAll();
  }
  else if (strcmp(cmd, "home_motor") == 0) {
    cmdHomeMotor();
  }
  else if (strcmp(cmd, "move_batch") == 0) {
    cmdMoveBatch();
  }
  else if (strcmp(cmd, "get_limits") == 0) {
    cmdGetLimits();
  }
  else if (strcmp(cmd, "led_test") == 0) {
    cmdLedTest();
  }
  else if (strcmp(cmd, "ping") == 0) {
    setLedState(LED_SUCCESS);
    sendResponse("pong", "OK");
  }
  else {
    setLedState(LED_ERROR);
    sendError("Unknown command");
  }
}

void cmdLedTest() {
  const char* pattern = docIn["pattern"] | "all";
  int value = docIn["value"] | 0;

  if (strcmp(pattern, "idle") == 0) {
    setLedState(LED_IDLE);
  } else if (strcmp(pattern, "moving") == 0) {
    setLedState(LED_MOVING);
  } else if (strcmp(pattern, "homing") == 0) {
    currentMotorActive = value;  // Set motor for homing animation
    setLedState(LED_HOMING);
  } else if (strcmp(pattern, "error") == 0) {
    setLedState(LED_ERROR);
  } else if (strcmp(pattern, "success") == 0) {
    setLedState(LED_SUCCESS);
  } else if (strcmp(pattern, "motor") == 0) {
    // Show specific motor indicator (value = motor index 0-3)
    setMotorActive(value);
  } else if (strcmp(pattern, "progress") == 0) {
    // Show progress bar (value = percentage 0-100)
    updateProgress(value);
  } else if (strcmp(pattern, "rgb") == 0) {
    // Test RGB LEDs - cycle through colors
    for (int i = 0; i < 8; i++) {
      uint8_t r = (i & 1) ? 255 : 0;
      uint8_t g = (i & 2) ? 255 : 0;
      uint8_t b = (i & 4) ? 255 : 0;
      setRgbColor(3, r, g, b);
      setRgbColor(4, b, g, r);  // Opposite on LED4
      delay(300);
    }
    setRgbOff(3);
    setRgbOff(4);
  } else if (strcmp(pattern, "matrix") == 0) {
    // Test matrix - sweep pattern
    for (int col = 0; col < MATRIX_COLS; col++) {
      clearMatrix();
      for (int row = 0; row < MATRIX_ROWS; row++) {
        setPixel(row, col, 1);
      }
      updateMatrixDisplay();
      delay(100);
    }
    clearMatrix();
    updateMatrixDisplay();
  } else if (strcmp(pattern, "all") == 0) {
    // Full LED test sequence
    // 1. Matrix sweep
    for (int col = 0; col < MATRIX_COLS; col++) {
      clearMatrix();
      for (int row = 0; row < MATRIX_ROWS; row++) {
        setPixel(row, col, 1);
      }
      updateMatrixDisplay();
      setRgbColor(3, col * 20, 255 - col * 10, col * 15);
      setRgbColor(4, 255 - col * 20, col * 10, 255 - col * 15);
      delay(50);
    }

    // 2. Progress bar demo
    for (int p = 0; p <= 100; p += 10) {
      updateProgress(p);
      delay(100);
    }

    // 3. Motor indicators
    for (int m = 0; m < NUM_MOTORS; m++) {
      setMotorActive(m);
      delay(500);
    }

    // 4. Status patterns
    showSuccessPattern();
    setRgbColor(3, 0, 255, 0);
    setRgbColor(4, 0, 255, 0);
    delay(500);

    showErrorPattern();
    setRgbColor(3, 255, 0, 0);
    setRgbColor(4, 255, 0, 0);
    delay(500);

    // Return to idle
    clearMatrix();
    updateMatrixDisplay();
    setLedState(LED_IDLE);
  } else {
    // Default: simple blink test
    for (int i = 0; i < 5; i++) {
      digitalWrite(STATUS_LED, LED_ON);
      setRgbColor(3, 255, 255, 255);
      setRgbColor(4, 255, 255, 255);
      delay(100);
      digitalWrite(STATUS_LED, LED_OFF);
      setRgbOff(3);
      setRgbOff(4);
      delay(100);
    }
  }

  sendResponse("ok", "LED test running");
}

void cmdInitMotor() {
  int motorId = docIn["motor_id"] | -1;
  int pulsePin = docIn["pulse_pin"] | -1;
  int dirPin = docIn["dir_pin"] | -1;
  int limitPin = docIn["limit_pin"] | -1;

  if (motorId < 1 || motorId > NUM_MOTORS) {
    setLedState(LED_ERROR);
    sendError("Invalid motor_id");
    return;
  }

  int idx = motorId - 1;

  // Update pins if provided
  if (pulsePin >= 0) motors[idx].pulsePin = pulsePin;
  if (dirPin >= 0) motors[idx].dirPin = dirPin;
  if (limitPin >= 0) motors[idx].limitPin = limitPin;

  // Initialize motor
  initMotor(idx);

  setLedState(LED_SUCCESS);
  sendResponse("ok", "Motor initialized");
}

void cmdStep() {
  int motorId = docIn["motor_id"] | -1;
  int direction = docIn["direction"] | 0;
  int steps = docIn["steps"] | 0;
  long delayUs = docIn["delay_us"] | 1000;
  bool respectLimit = docIn["respect_limit"] | true;

  if (motorId < 1 || motorId > NUM_MOTORS) {
    setLedState(LED_ERROR);
    sendError("Invalid motor_id");
    return;
  }

  int idx = motorId - 1;

  if (!motors[idx].initialized) {
    setLedState(LED_ERROR);
    sendError("Motor not initialized");
    return;
  }

  // Set LED to moving state
  setLedState(LED_MOVING);

  // Execute steps
  int stepsExecuted = executeSteps(idx, direction, steps, delayUs, respectLimit);

  // Return to idle
  setLedState(LED_IDLE);

  // Send response with steps executed
  docOut.clear();
  docOut["status"] = "ok";
  docOut["steps_executed"] = stepsExecuted;
  docOut["limit_triggered"] = isLimitTriggered(idx);
  serializeJson(docOut, Monitor);
  Monitor.println();
}

int executeSteps(int motorIndex, int direction, int steps, long delayUs, bool respectLimit) {
  // Set direction
  digitalWrite(motors[motorIndex].dirPin, direction ? HIGH : LOW);

  // Small delay after direction change
  delayMicroseconds(5);

  int stepsExecuted = 0;
  int ledToggleInterval = max(1, steps / 20);  // Toggle LED ~20 times during move
  int progressUpdateInterval = max(1, steps / 10);  // Update progress ~10 times

  // Show which motor is active
  setMotorActive(motorIndex);

  // Generate step pulses
  for (int i = 0; i < steps; i++) {
    // Check limit switch if respecting limits
    if (respectLimit && isLimitTriggered(motorIndex)) {
      break;
    }

    digitalWrite(motors[motorIndex].pulsePin, HIGH);
    delayMicroseconds(delayUs);
    digitalWrite(motors[motorIndex].pulsePin, LOW);
    delayMicroseconds(delayUs);
    stepsExecuted++;

    // LED animation during movement
    if (stepsExecuted % ledToggleInterval == 0) {
      ledPulseOnStep();
    }

    // Update progress bar on matrix
    if (stepsExecuted % progressUpdateInterval == 0) {
      int percent = (stepsExecuted * 100) / steps;
      updateProgress(percent);
    }
  }

  // Show completion
  updateProgress(100);

  return stepsExecuted;
}

void cmdStop() {
  int motorId = docIn["motor_id"] | -1;

  if (motorId < 1 || motorId > NUM_MOTORS) {
    setLedState(LED_ERROR);
    sendError("Invalid motor_id");
    return;
  }

  int idx = motorId - 1;

  // Set pins low
  digitalWrite(motors[idx].pulsePin, LOW);
  digitalWrite(motors[idx].dirPin, LOW);

  setLedState(LED_IDLE);
  sendResponse("ok", "Motor stopped");
}

void cmdStopAll() {
  for (int i = 0; i < NUM_MOTORS; i++) {
    if (motors[i].initialized) {
      digitalWrite(motors[i].pulsePin, LOW);
      digitalWrite(motors[i].dirPin, LOW);
    }
  }
  setLedState(LED_IDLE);
  sendResponse("ok", "All motors stopped");
}

void cmdHomeMotor() {
  int motorId = docIn["motor_id"] | -1;
  int direction = docIn["direction"] | 0;  // Direction to move toward home
  long delayUs = docIn["delay_us"] | 2000;  // Slower speed for homing
  int maxSteps = docIn["max_steps"] | 10000;  // Safety limit

  if (motorId < 1 || motorId > NUM_MOTORS) {
    setLedState(LED_ERROR);
    sendError("Invalid motor_id");
    return;
  }

  int idx = motorId - 1;

  if (!motors[idx].initialized) {
    setLedState(LED_ERROR);
    sendError("Motor not initialized");
    return;
  }

  // Set LED to homing state
  setLedState(LED_HOMING);

  // Set direction toward home
  digitalWrite(motors[idx].dirPin, direction ? HIGH : LOW);
  delayMicroseconds(5);

  int stepsExecuted = 0;
  int ledToggleInterval = 50;  // Toggle LED every 50 steps

  // Move until limit switch is triggered or max steps reached
  while (stepsExecuted < maxSteps) {
    if (isLimitTriggered(idx)) {
      break;
    }

    digitalWrite(motors[idx].pulsePin, HIGH);
    delayMicroseconds(delayUs);
    digitalWrite(motors[idx].pulsePin, LOW);
    delayMicroseconds(delayUs);
    stepsExecuted++;

    // LED animation
    if (stepsExecuted % ledToggleInterval == 0) {
      ledPulseOnStep();
    }
  }

  // Success or continue to idle
  if (isLimitTriggered(idx)) {
    setLedState(LED_SUCCESS);
  } else {
    setLedState(LED_IDLE);
  }

  // Send response
  docOut.clear();
  docOut["status"] = "ok";
  docOut["motor_id"] = motorId;
  docOut["steps_to_home"] = stepsExecuted;
  docOut["homed"] = isLimitTriggered(idx);
  serializeJson(docOut, Monitor);
  Monitor.println();
}

void cmdHomeAll() {
  int direction = docIn["direction"] | 0;
  long delayUs = docIn["delay_us"] | 2000;
  int maxSteps = docIn["max_steps"] | 10000;

  int stepsToHome[NUM_MOTORS] = {0};
  bool homed[NUM_MOTORS] = {false};

  // Set LED to homing state
  setLedState(LED_HOMING);

  // Home each motor sequentially
  for (int i = 0; i < NUM_MOTORS; i++) {
    if (!motors[i].initialized) continue;

    // Set direction
    digitalWrite(motors[i].dirPin, direction ? HIGH : LOW);
    delayMicroseconds(5);

    int ledToggleInterval = 50;

    // Move until limit
    while (stepsToHome[i] < maxSteps) {
      if (isLimitTriggered(i)) {
        homed[i] = true;
        break;
      }

      digitalWrite(motors[i].pulsePin, HIGH);
      delayMicroseconds(delayUs);
      digitalWrite(motors[i].pulsePin, LOW);
      delayMicroseconds(delayUs);
      stepsToHome[i]++;

      // LED animation
      if (stepsToHome[i] % ledToggleInterval == 0) {
        ledPulseOnStep();
      }
    }
  }

  // Check if all homed successfully
  bool allHomed = true;
  for (int i = 0; i < NUM_MOTORS; i++) {
    if (motors[i].initialized && !homed[i]) {
      allHomed = false;
      break;
    }
  }

  if (allHomed) {
    setLedState(LED_SUCCESS);
  } else {
    setLedState(LED_IDLE);
  }

  // Send response
  docOut.clear();
  docOut["status"] = "ok";
  JsonArray stepsArray = docOut.createNestedArray("steps_to_home");
  JsonArray homedArray = docOut.createNestedArray("homed");
  for (int i = 0; i < NUM_MOTORS; i++) {
    stepsArray.add(stepsToHome[i]);
    homedArray.add(homed[i]);
  }
  serializeJson(docOut, Monitor);
  Monitor.println();
}

void cmdGetLimits() {
  updateLimitSwitches();

  docOut.clear();
  docOut["status"] = "ok";
  JsonArray limits = docOut.createNestedArray("limits");

  for (int i = 0; i < NUM_MOTORS; i++) {
    JsonObject limitObj = limits.createNestedObject();
    limitObj["motor_id"] = i + 1;
    limitObj["triggered"] = motors[i].limitTriggered;
    limitObj["pin"] = motors[i].limitPin;
  }

  serializeJson(docOut, Monitor);
  Monitor.println();
}

void cmdMoveBatch() {
  JsonArray movements = docIn["movements"];
  bool respectLimits = docIn["respect_limits"] | true;

  if (movements.isNull()) {
    setLedState(LED_ERROR);
    sendError("Missing movements array");
    return;
  }

  // Set LED to moving state
  setLedState(LED_MOVING);

  // Find the maximum steps across all movements
  int maxSteps = 0;
  for (JsonObject movement : movements) {
    int steps = movement["steps"] | 0;
    if (steps > maxSteps) maxSteps = steps;
  }

  // Set directions for all motors
  for (JsonObject movement : movements) {
    int motorId = movement["motor_id"] | -1;
    int direction = movement["direction"] | 0;

    if (motorId >= 1 && motorId <= NUM_MOTORS) {
      int idx = motorId - 1;
      if (motors[idx].initialized) {
        digitalWrite(motors[idx].dirPin, direction ? HIGH : LOW);
      }
    }
  }

  delayMicroseconds(5);

  // Use the smallest delay for synchronization
  long minDelay = 1000;
  for (JsonObject movement : movements) {
    long delayUs = movement["delay_us"] | 1000;
    if (delayUs < minDelay) minDelay = delayUs;
  }

  // Track remaining steps and executed steps for each motor
  int remainingSteps[NUM_MOTORS] = {0};
  int executedSteps[NUM_MOTORS] = {0};
  bool limitHit[NUM_MOTORS] = {false};

  for (JsonObject movement : movements) {
    int motorId = movement["motor_id"] | -1;
    if (motorId >= 1 && motorId <= NUM_MOTORS) {
      remainingSteps[motorId - 1] = movement["steps"] | 0;
    }
  }

  int ledToggleInterval = max(1, maxSteps / 20);

  // Execute steps in lockstep
  for (int step = 0; step < maxSteps; step++) {
    // Pulse high for motors with remaining steps
    for (int i = 0; i < NUM_MOTORS; i++) {
      if (remainingSteps[i] > 0 && motors[i].initialized) {
        // Check limit switch
        if (respectLimits && isLimitTriggered(i)) {
          limitHit[i] = true;
          remainingSteps[i] = 0;
          continue;
        }
        digitalWrite(motors[i].pulsePin, HIGH);
      }
    }

    delayMicroseconds(minDelay);

    // Pulse low
    for (int i = 0; i < NUM_MOTORS; i++) {
      if (remainingSteps[i] > 0 && motors[i].initialized) {
        digitalWrite(motors[i].pulsePin, LOW);
        remainingSteps[i]--;
        executedSteps[i]++;
      }
    }

    delayMicroseconds(minDelay);

    // LED animation
    if (step % ledToggleInterval == 0) {
      ledPulseOnStep();
    }
  }

  // Return to idle
  setLedState(LED_IDLE);

  // Send response with details
  docOut.clear();
  docOut["status"] = "ok";
  JsonArray results = docOut.createNestedArray("results");
  for (int i = 0; i < NUM_MOTORS; i++) {
    if (executedSteps[i] > 0 || limitHit[i]) {
      JsonObject result = results.createNestedObject();
      result["motor_id"] = i + 1;
      result["steps_executed"] = executedSteps[i];
      result["limit_hit"] = limitHit[i];
    }
  }
  serializeJson(docOut, Monitor);
  Monitor.println();
}

void sendResponse(const char* status, const char* message) {
  docOut.clear();
  docOut["status"] = status;
  docOut["message"] = message;
  serializeJson(docOut, Monitor);
  Monitor.println();
}

void sendError(const char* message) {
  sendResponse("error", message);
}
