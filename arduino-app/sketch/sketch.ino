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

// ============== RGB LED Configuration ==============
// RGB LEDs 3 & 4 on Arduino UNO Q - Active LOW (LOW = ON, HIGH = OFF)
#define RGB_ON LOW
#define RGB_OFF HIGH

// Current RGB state
uint8_t rgb3_r = 0, rgb3_g = 0, rgb3_b = 0;
uint8_t rgb4_r = 0, rgb4_g = 0, rgb4_b = 0;

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

// ============== RGB LED Functions ==============

void initRgbLeds() {
  // Initialize RGB LED 3 pins
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
}

void setRgbLed3(uint8_t r, uint8_t g, uint8_t b) {
  rgb3_r = r; rgb3_g = g; rgb3_b = b;
  // Active-low: LOW = ON, HIGH = OFF
  digitalWrite(LED3_R, r > 127 ? RGB_ON : RGB_OFF);
  digitalWrite(LED3_G, g > 127 ? RGB_ON : RGB_OFF);
  digitalWrite(LED3_B, b > 127 ? RGB_ON : RGB_OFF);
}

void setRgbLed4(uint8_t r, uint8_t g, uint8_t b) {
  rgb4_r = r; rgb4_g = g; rgb4_b = b;
  // Active-low: LOW = ON, HIGH = OFF
  digitalWrite(LED4_R, r > 127 ? RGB_ON : RGB_OFF);
  digitalWrite(LED4_G, g > 127 ? RGB_ON : RGB_OFF);
  digitalWrite(LED4_B, b > 127 ? RGB_ON : RGB_OFF);
}

void setRgbBoth(uint8_t r, uint8_t g, uint8_t b) {
  setRgbLed3(r, g, b);
  setRgbLed4(r, g, b);
}

void rgbOff() {
  setRgbBoth(0, 0, 0);
}

void showProgressBar(int percent) {
  clearMatrix();
  int filledCols = (percent * MATRIX_COLS) / 100;
  for (int col = 0; col < filledCols; col++) {
    for (int row = 1; row < 5; row++) {  // Shifted up: rows 1-4 instead of 2-5
      setPixel(row, col, 1);
    }
  }
  updateMatrixDisplay();
  // RGB: Blue gradient based on progress
  setRgbLed3(0, 0, 255);
  setRgbLed4(0, percent * 2, 255 - percent);
}

void showSuccessPattern() {
  clearMatrix();
  // Checkmark shifted up by 2 rows
  setPixel(3, 2, 1); setPixel(4, 3, 1); setPixel(5, 4, 1);
  setPixel(4, 5, 1); setPixel(3, 6, 1); setPixel(2, 7, 1);
  setPixel(1, 8, 1); setPixel(0, 9, 1);
  updateMatrixDisplay();
  // RGB: Green for success
  setRgbBoth(0, 255, 0);
}

void showErrorPattern() {
  clearMatrix();
  for (int i = 0; i < min(MATRIX_ROWS, MATRIX_COLS); i++) {
    setPixel(i, i, 1);
    setPixel(i, MATRIX_COLS - 1 - i, 1);
  }
  updateMatrixDisplay();
  // RGB: Red for error
  setRgbBoth(255, 0, 0);
}

void showIdlePattern() {
  static int phase = 0;
  clearMatrix();
  int centerRow = 3;  // Shifted up: was MATRIX_ROWS/2 (4), now 3
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
  // RGB status: Alternating colors between LED3 and LED4
  static uint8_t colorPhase = 0;
  colorPhase++;

  // Alternate between LED3 and LED4 with complementary colors
  if (colorPhase % 2 == 0) {
    setRgbLed3(0, 128, 255);   // Cyan
    setRgbLed4(255, 128, 0);   // Orange
  } else {
    setRgbLed3(255, 128, 0);   // Orange
    setRgbLed4(0, 128, 255);   // Cyan
  }
}

void showMotorIndicator(int motorIndex) {
  clearMatrix();
  int startCol = motorIndex * 3;
  // Motor block - shifted up: rows 3-5 instead of 5-7
  for (int row = 3; row < 6; row++) {
    for (int col = startCol; col < startCol + 3 && col < MATRIX_COLS; col++) {
      setPixel(row, col, 1);
    }
  }
  // Motor letter - shifted up: rows 0-2 instead of 1-3
  switch (motorIndex) {
    case 0: // X - Red
      setPixel(0, startCol, 1); setPixel(0, startCol+2, 1);
      setPixel(1, startCol+1, 1);
      setPixel(2, startCol, 1); setPixel(2, startCol+2, 1);
      setRgbLed3(255, 0, 0);
      setRgbLed4(255, 128, 0);
      break;
    case 1: // Y - Green
      setPixel(0, startCol, 1); setPixel(0, startCol+2, 1);
      setPixel(1, startCol+1, 1); setPixel(2, startCol+1, 1);
      setRgbLed3(0, 255, 0);
      setRgbLed4(128, 255, 0);
      break;
    case 2: // Z - Blue
      setPixel(0, startCol, 1); setPixel(0, startCol+1, 1); setPixel(0, startCol+2, 1);
      setPixel(1, startCol+1, 1);
      setPixel(2, startCol, 1); setPixel(2, startCol+1, 1); setPixel(2, startCol+2, 1);
      setRgbLed3(0, 0, 255);
      setRgbLed4(0, 128, 255);
      break;
    case 3: // P (Pipette) - Magenta
      setPixel(0, startCol, 1); setPixel(0, startCol+1, 1);
      setPixel(1, startCol, 1); setPixel(1, startCol+1, 1);
      setPixel(2, startCol, 1);
      setRgbLed3(255, 0, 255);
      setRgbLed4(255, 0, 128);
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
// pattern_id: 0=idle, 1=success, 2=error, 3=progress50, 4-7=motors, 8=sweep, 9=all, 10=rgb_cycle
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
      // Sweep pattern with RGB rainbow
      for (int col = 0; col < MATRIX_COLS; col++) {
        clearMatrix();
        for (int row = 0; row < MATRIX_ROWS; row++) {
          setPixel(row, col, 1);
        }
        updateMatrixDisplay();
        // Rainbow RGB effect during sweep
        int hue = (col * 255) / MATRIX_COLS;
        if (hue < 85) {
          setRgbLed3(255 - hue * 3, hue * 3, 0);
          setRgbLed4(hue * 3, 0, 255 - hue * 3);
        } else if (hue < 170) {
          hue -= 85;
          setRgbLed3(0, 255 - hue * 3, hue * 3);
          setRgbLed4(255 - hue * 3, hue * 3, 0);
        } else {
          hue -= 170;
          setRgbLed3(hue * 3, 0, 255 - hue * 3);
          setRgbLed4(0, 255 - hue * 3, hue * 3);
        }
        delay(50);
      }
      clearMatrix();
      updateMatrixDisplay();
      rgbOff();
      break;
    case 9:
      // Full test with RGB
      // Sweep with rainbow
      for (int col = 0; col < MATRIX_COLS; col++) {
        clearMatrix();
        for (int row = 0; row < MATRIX_ROWS; row++) {
          setPixel(row, col, 1);
        }
        updateMatrixDisplay();
        int hue = (col * 255) / MATRIX_COLS;
        if (hue < 85) {
          setRgbBoth(255 - hue * 3, hue * 3, 0);
        } else if (hue < 170) {
          setRgbBoth(0, 255 - (hue-85) * 3, (hue-85) * 3);
        } else {
          setRgbBoth((hue-170) * 3, 0, 255 - (hue-170) * 3);
        }
        delay(30);
      }
      // Progress bar
      for (int p = 0; p <= 100; p += 10) {
        showProgressBar(p);
        delay(50);
      }
      // Motor indicators (each with unique color)
      for (int m = 0; m < NUM_MOTORS; m++) {
        showMotorIndicator(m);
        delay(300);
      }
      showSuccessPattern();
      delay(500);
      break;
    case 10:
      // RGB cycle only
      for (int i = 0; i < 3; i++) {
        setRgbBoth(255, 0, 0);   // Red
        delay(200);
        setRgbBoth(0, 255, 0);   // Green
        delay(200);
        setRgbBoth(0, 0, 255);   // Blue
        delay(200);
        setRgbBoth(255, 255, 0); // Yellow
        delay(200);
        setRgbBoth(0, 255, 255); // Cyan
        delay(200);
        setRgbBoth(255, 0, 255); // Magenta
        delay(200);
        setRgbBoth(255, 255, 255); // White
        delay(200);
      }
      rgbOff();
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

// set_rgb(led_num, r, g, b) -> 1 if success
// led_num: 3 or 4, or 0 for both
int rpc_set_rgb(int led_num, int r, int g, int b) {
  if (led_num == 0) {
    setRgbBoth(r, g, b);
  } else if (led_num == 3) {
    setRgbLed3(r, g, b);
  } else if (led_num == 4) {
    setRgbLed4(r, g, b);
  } else {
    return -1;
  }
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

  // Initialize RGB LEDs
  initRgbLeds();
  setRgbBoth(255, 255, 0);  // Yellow during startup

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
  Bridge.provide("set_rgb", rpc_set_rgb);

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
  }
}
