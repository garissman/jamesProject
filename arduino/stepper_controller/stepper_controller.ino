/*
 * Stepper Motor Controller for Arduino UNO Q (STM32U585 MCU)
 * Laboratory Sampler - 4 Stepper Motor Control with Limit Switches
 *
 * Uses Bridge RPC for communication with MPU via arduino-router
 *
 * Visual Feedback System:
 * - 8x13 Blue LED Matrix: Progress bars, motor indicators, patterns
 * - Built-in LED: Fallback status indicator
 *
 * Pin Configuration (JDIGITAL Header):
 * Motor 1 (X-axis): Pulse=D2, Dir=D3, Limit=D10
 * Motor 2 (Y-axis): Pulse=D4, Dir=D5, Limit=D11
 * Motor 3 (Z-axis): Pulse=D6, Dir=D7, Limit=D12
 * Motor 4 (Pipette): Pulse=D8, Dir=D9, Limit=D13
 */

#include <ArduinoGraphics.h>
#include <Arduino_LED_Matrix.h>
#include <Arduino_RouterBridge.h>

// Number of motors
#define NUM_MOTORS 4

// ============== LED Matrix Configuration ==============
ArduinoLEDMatrix matrix;
#define MATRIX_ROWS 8
#define MATRIX_COLS 13
uint8_t matrixFrame[MATRIX_ROWS * MATRIX_COLS];

// Built-in LED
#define STATUS_LED LED_BUILTIN
#define LED_ON HIGH
#define LED_OFF LOW

// Motor pin definitions
struct MotorConfig {
  int pulsePin;
  int dirPin;
  int limitPin;
  bool initialized;
};

// Default motor pin configuration
MotorConfig motors[NUM_MOTORS] = {
  {2, 3, 10, false},   // Motor 1 (X-axis)
  {4, 5, 11, false},   // Motor 2 (Y-axis)
  {6, 7, 12, false},   // Motor 3 (Z-axis)
  {8, 9, 13, false}    // Motor 4 (Pipette)
};

// ============== Helper Functions ==============

inline void setPixel(int row, int col, uint8_t value) {
  if (row >= 0 && row < MATRIX_ROWS && col >= 0 && col < MATRIX_COLS) {
    matrixFrame[row * MATRIX_COLS + col] = value;
  }
}

void clearMatrix() {
  memset(matrixFrame, 0, sizeof(matrixFrame));
}

void updateMatrixDisplay() {
  matrix.draw(matrixFrame);
}

void showProgressBar(int percent) {
  clearMatrix();
  int filledCols = (percent * MATRIX_COLS) / 100;
  for (int col = 0; col < filledCols; col++) {
    for (int row = 2; row < 6; row++) {
      setPixel(row, col, 1);
    }
  }
  updateMatrixDisplay();
}

void showSuccessPattern() {
  clearMatrix();
  setPixel(5, 2, 1); setPixel(6, 3, 1); setPixel(7, 4, 1);
  setPixel(6, 5, 1); setPixel(5, 6, 1); setPixel(4, 7, 1);
  setPixel(3, 8, 1); setPixel(2, 9, 1);
  updateMatrixDisplay();
}

void showErrorPattern() {
  clearMatrix();
  for (int i = 0; i < min(MATRIX_ROWS, MATRIX_COLS); i++) {
    setPixel(i, i, 1);
    setPixel(i, MATRIX_COLS - 1 - i, 1);
  }
  updateMatrixDisplay();
}

void showIdlePattern() {
  static int phase = 0;
  clearMatrix();
  int centerRow = MATRIX_ROWS / 2;
  int centerCol = MATRIX_COLS / 2;
  int radius = (phase % 4);
  for (int dr = -radius; dr <= radius; dr++) {
    for (int dc = -radius; dc <= radius; dc++) {
      if (abs(dr) + abs(dc) == radius) {
        setPixel(centerRow + dr, centerCol + dc, 1);
      }
    }
  }
  phase++;
  updateMatrixDisplay();
}

void showMotorIndicator(int motorIndex) {
  clearMatrix();
  int startCol = motorIndex * 3;
  for (int row = 5; row < 8; row++) {
    for (int col = startCol; col < startCol + 3 && col < MATRIX_COLS; col++) {
      setPixel(row, col, 1);
    }
  }
  // Motor letter
  switch (motorIndex) {
    case 0: // X
      setPixel(1, startCol, 1); setPixel(1, startCol+2, 1);
      setPixel(2, startCol+1, 1);
      setPixel(3, startCol, 1); setPixel(3, startCol+2, 1);
      break;
    case 1: // Y
      setPixel(1, startCol, 1); setPixel(1, startCol+2, 1);
      setPixel(2, startCol+1, 1); setPixel(3, startCol+1, 1);
      break;
    case 2: // Z
      setPixel(1, startCol, 1); setPixel(1, startCol+1, 1); setPixel(1, startCol+2, 1);
      setPixel(2, startCol+1, 1);
      setPixel(3, startCol, 1); setPixel(3, startCol+1, 1); setPixel(3, startCol+2, 1);
      break;
    case 3: // P
      setPixel(1, startCol, 1); setPixel(1, startCol+1, 1);
      setPixel(2, startCol, 1); setPixel(2, startCol+1, 1);
      setPixel(3, startCol, 1);
      break;
  }
  updateMatrixDisplay();
}

// ============== Motor Functions ==============

void initMotor(int idx) {
  if (idx < 0 || idx >= NUM_MOTORS) return;
  pinMode(motors[idx].pulsePin, OUTPUT);
  pinMode(motors[idx].dirPin, OUTPUT);
  digitalWrite(motors[idx].pulsePin, LOW);
  digitalWrite(motors[idx].dirPin, LOW);
  pinMode(motors[idx].limitPin, INPUT_PULLUP);
  motors[idx].initialized = true;
}

bool isLimitTriggered(int idx) {
  if (idx < 0 || idx >= NUM_MOTORS) return true;
  return digitalRead(motors[idx].limitPin) == LOW;
}

int executeSteps(int idx, int direction, int steps, long delayUs, bool respectLimit) {
  digitalWrite(motors[idx].dirPin, direction ? HIGH : LOW);
  delayMicroseconds(5);

  int executed = 0;
  int progressInterval = max(1, steps / 10);

  showMotorIndicator(idx);

  for (int i = 0; i < steps; i++) {
    if (respectLimit && isLimitTriggered(idx)) break;

    digitalWrite(motors[idx].pulsePin, HIGH);
    delayMicroseconds(delayUs);
    digitalWrite(motors[idx].pulsePin, LOW);
    delayMicroseconds(delayUs);
    executed++;

    if (executed % progressInterval == 0) {
      showProgressBar((executed * 100) / steps);
    }
  }

  showProgressBar(100);
  delay(100);
  showSuccessPattern();

  return executed;
}

// ============== RPC Functions ==============

String rpc_ping() {
  showSuccessPattern();
  digitalWrite(STATUS_LED, LED_ON);
  delay(100);
  digitalWrite(STATUS_LED, LED_OFF);
  return String("pong");
}

// move_motor(motor_id, steps, direction, delay_us) -> steps_executed
int rpc_move(int motor_id, int steps, int direction, int delay_us) {
  if (motor_id < 1 || motor_id > NUM_MOTORS) return -1;
  int idx = motor_id - 1;
  if (!motors[idx].initialized) return -2;

  return executeSteps(idx, direction, steps, delay_us, true);
}

// home_motor(motor_id, direction, delay_us, max_steps) -> steps_to_home (-1 if failed)
int rpc_home(int motor_id, int direction, int delay_us, int max_steps) {
  if (motor_id < 1 || motor_id > NUM_MOTORS) return -1;
  int idx = motor_id - 1;
  if (!motors[idx].initialized) return -2;

  digitalWrite(motors[idx].dirPin, direction ? HIGH : LOW);
  delayMicroseconds(5);

  int steps = 0;
  showMotorIndicator(idx);

  while (steps < max_steps) {
    if (isLimitTriggered(idx)) {
      showSuccessPattern();
      return steps;
    }

    digitalWrite(motors[idx].pulsePin, HIGH);
    delayMicroseconds(delay_us);
    digitalWrite(motors[idx].pulsePin, LOW);
    delayMicroseconds(delay_us);
    steps++;

    if (steps % 100 == 0) {
      showProgressBar((steps * 100) / max_steps);
    }
  }

  showErrorPattern();
  return -3;  // Max steps reached without hitting limit
}

// get_limit(motor_id) -> 1 if triggered, 0 if not, -1 if invalid
int rpc_get_limit(int motor_id) {
  if (motor_id < 1 || motor_id > NUM_MOTORS) return -1;
  return isLimitTriggered(motor_id - 1) ? 1 : 0;
}

// stop_motor(motor_id) -> 1 if success
int rpc_stop(int motor_id) {
  if (motor_id < 1 || motor_id > NUM_MOTORS) return -1;
  int idx = motor_id - 1;
  digitalWrite(motors[idx].pulsePin, LOW);
  digitalWrite(motors[idx].dirPin, LOW);
  showIdlePattern();
  return 1;
}

// stop_all() -> 1 if success
int rpc_stop_all() {
  for (int i = 0; i < NUM_MOTORS; i++) {
    if (motors[i].initialized) {
      digitalWrite(motors[i].pulsePin, LOW);
      digitalWrite(motors[i].dirPin, LOW);
    }
  }
  showIdlePattern();
  return 1;
}

// led_test(pattern_id) -> 1 if success
// pattern_id: 0=idle, 1=success, 2=error, 3=progress50, 4=motor0, 5=motor1, 6=motor2, 7=motor3, 8=sweep, 9=all
int rpc_led_test(int pattern_id) {
  switch (pattern_id) {
    case 0:
      showIdlePattern();
      break;
    case 1:
      showSuccessPattern();
      break;
    case 2:
      showErrorPattern();
      break;
    case 3:
      showProgressBar(50);
      break;
    case 4:
    case 5:
    case 6:
    case 7:
      showMotorIndicator(pattern_id - 4);
      break;
    case 8:
      // Sweep pattern
      for (int col = 0; col < MATRIX_COLS; col++) {
        clearMatrix();
        for (int row = 0; row < MATRIX_ROWS; row++) {
          setPixel(row, col, 1);
        }
        updateMatrixDisplay();
        delay(50);
      }
      clearMatrix();
      updateMatrixDisplay();
      break;
    case 9:
      // Full test
      for (int col = 0; col < MATRIX_COLS; col++) {
        clearMatrix();
        for (int row = 0; row < MATRIX_ROWS; row++) {
          setPixel(row, col, 1);
        }
        updateMatrixDisplay();
        delay(30);
      }
      for (int p = 0; p <= 100; p += 10) {
        showProgressBar(p);
        delay(50);
      }
      for (int m = 0; m < NUM_MOTORS; m++) {
        showMotorIndicator(m);
        delay(300);
      }
      showSuccessPattern();
      delay(500);
      break;
    default:
      showIdlePattern();
  }
  return 1;
}

// init_motor(motor_id) -> 1 if success
int rpc_init_motor(int motor_id) {
  if (motor_id < 1 || motor_id > NUM_MOTORS) return -1;
  initMotor(motor_id - 1);
  return 1;
}

// ============== Setup & Loop ==============

void setup() {
  // Initialize LED Matrix
  matrix.begin();
  memset(matrixFrame, 1, sizeof(matrixFrame));
  matrix.draw(matrixFrame);
  delay(300);

  // Initialize Bridge
  if (!Bridge.begin()) {
    showErrorPattern();
    while(1);
  }

  // Initialize status LED
  pinMode(STATUS_LED, OUTPUT);
  digitalWrite(STATUS_LED, LED_OFF);

  // Startup sweep animation
  for (int col = 0; col < MATRIX_COLS; col++) {
    clearMatrix();
    for (int row = 0; row < MATRIX_ROWS; row++) {
      setPixel(row, col, 1);
    }
    updateMatrixDisplay();
    delay(30);
  }

  // Initialize all motors
  for (int i = 0; i < NUM_MOTORS; i++) {
    initMotor(i);
  }

  // Register RPC functions
  Bridge.provide("ping", rpc_ping);
  Bridge.provide("move", rpc_move);
  Bridge.provide("home", rpc_home);
  Bridge.provide("get_limit", rpc_get_limit);
  Bridge.provide("stop", rpc_stop);
  Bridge.provide("stop_all", rpc_stop_all);
  Bridge.provide("led_test", rpc_led_test);
  Bridge.provide("init_motor", rpc_init_motor);

  // Show success
  showSuccessPattern();
  delay(500);

  // Go to idle
  showIdlePattern();
}

void loop() {
  // Idle animation every 500ms
  static unsigned long lastIdle = 0;
  if (millis() - lastIdle >= 500) {
    lastIdle = millis();
    showIdlePattern();

    // Blink status LED
    static bool ledState = false;
    ledState = !ledState;
    digitalWrite(STATUS_LED, ledState ? LED_ON : LED_OFF);
  }
}
