/*
 * Stepper Motor Controller for Arduino UNO Q (STM32U585 MCU)
 * Laboratory Sampler - 4 Stepper Motor Control with Limit Switches
 *
 * With LED status animations:
 * - Idle: Slow breathing effect
 * - Moving: Fast blinking
 * - Homing: Double blink pattern
 * - Error: Rapid flash
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

// Number of motors
#define NUM_MOTORS 4

// LED Configuration - Use built-in LED or define custom pin
#ifndef LED_BUILTIN
  #define LED_BUILTIN 25  // Fallback for Arduino UNO Q
#endif

#define LED_PIN LED_BUILTIN
#define LED_PIN_2 A0  // Optional second LED for status (analog pin as digital)

// LED Animation States
enum LedState {
  LED_IDLE,
  LED_MOVING,
  LED_HOMING,
  LED_ERROR,
  LED_SUCCESS
};

LedState currentLedState = LED_IDLE;
unsigned long lastLedUpdate = 0;
int ledBrightness = 0;
int ledDirection = 1;
bool ledOn = false;
int ledBlinkCount = 0;

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
  // Initialize LED pins
  pinMode(LED_PIN, OUTPUT);
  pinMode(LED_PIN_2, OUTPUT);
  digitalWrite(LED_PIN, LOW);
  digitalWrite(LED_PIN_2, LOW);

  // Startup animation
  startupAnimation();

  // Initialize serial communication
  Serial.begin(115200);
  while (!Serial) {
    ; // Wait for serial port to connect
  }

  // Initialize all motor pins
  for (int i = 0; i < NUM_MOTORS; i++) {
    initMotor(i);
  }

  // Success blink
  setLedState(LED_SUCCESS);

  // Send ready message
  sendResponse("ready", "Stepper controller initialized");
}

void loop() {
  // Update LED animation
  updateLedAnimation();

  // Check for serial input
  while (Serial.available()) {
    char c = Serial.read();
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

// ============== LED Animation Functions ==============

void startupAnimation() {
  // Knight Rider style sweep
  for (int j = 0; j < 3; j++) {
    for (int i = 0; i < 5; i++) {
      digitalWrite(LED_PIN, HIGH);
      delay(50);
      digitalWrite(LED_PIN, LOW);
      delay(50);
    }
    delay(200);
  }
}

void setLedState(LedState state) {
  currentLedState = state;
  lastLedUpdate = millis();
  ledBlinkCount = 0;

  if (state == LED_SUCCESS) {
    // Quick success flash
    for (int i = 0; i < 3; i++) {
      digitalWrite(LED_PIN, HIGH);
      digitalWrite(LED_PIN_2, HIGH);
      delay(100);
      digitalWrite(LED_PIN, LOW);
      digitalWrite(LED_PIN_2, LOW);
      delay(100);
    }
    currentLedState = LED_IDLE;
  }
}

void updateLedAnimation() {
  unsigned long now = millis();

  switch (currentLedState) {
    case LED_IDLE:
      // Slow breathing effect (sine wave simulation)
      if (now - lastLedUpdate >= 30) {
        lastLedUpdate = now;
        ledBrightness += ledDirection * 5;
        if (ledBrightness >= 255) {
          ledBrightness = 255;
          ledDirection = -1;
        } else if (ledBrightness <= 0) {
          ledBrightness = 0;
          ledDirection = 1;
        }
        analogWrite(LED_PIN, ledBrightness);
      }
      break;

    case LED_MOVING:
      // Fast alternating blink
      if (now - lastLedUpdate >= 100) {
        lastLedUpdate = now;
        ledOn = !ledOn;
        digitalWrite(LED_PIN, ledOn ? HIGH : LOW);
        digitalWrite(LED_PIN_2, ledOn ? LOW : HIGH);  // Alternate
      }
      break;

    case LED_HOMING:
      // Double blink pattern
      if (now - lastLedUpdate >= 150) {
        lastLedUpdate = now;
        ledBlinkCount++;
        if (ledBlinkCount <= 2) {
          ledOn = !ledOn;
        } else if (ledBlinkCount == 4) {
          ledBlinkCount = 0;
        }
        digitalWrite(LED_PIN, ledOn ? HIGH : LOW);
        digitalWrite(LED_PIN_2, ledOn ? HIGH : LOW);
      }
      break;

    case LED_ERROR:
      // Rapid flash
      if (now - lastLedUpdate >= 50) {
        lastLedUpdate = now;
        ledOn = !ledOn;
        digitalWrite(LED_PIN, ledOn ? HIGH : LOW);
        digitalWrite(LED_PIN_2, ledOn ? HIGH : LOW);
      }
      break;

    default:
      break;
  }
}

void ledPulseOnStep() {
  // Quick pulse during each step - toggle LED
  static bool stepLedState = false;
  stepLedState = !stepLedState;
  digitalWrite(LED_PIN, stepLedState ? HIGH : LOW);
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

  if (strcmp(pattern, "idle") == 0) {
    setLedState(LED_IDLE);
  } else if (strcmp(pattern, "moving") == 0) {
    setLedState(LED_MOVING);
  } else if (strcmp(pattern, "homing") == 0) {
    setLedState(LED_HOMING);
  } else if (strcmp(pattern, "error") == 0) {
    setLedState(LED_ERROR);
  } else if (strcmp(pattern, "success") == 0) {
    setLedState(LED_SUCCESS);
  } else {
    // Test all patterns
    startupAnimation();
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
  serializeJson(docOut, Serial);
  Serial.println();
}

int executeSteps(int motorIndex, int direction, int steps, long delayUs, bool respectLimit) {
  // Set direction
  digitalWrite(motors[motorIndex].dirPin, direction ? HIGH : LOW);

  // Small delay after direction change
  delayMicroseconds(5);

  int stepsExecuted = 0;
  int ledToggleInterval = max(1, steps / 20);  // Toggle LED ~20 times during move

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
  }

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
  serializeJson(docOut, Serial);
  Serial.println();
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
  serializeJson(docOut, Serial);
  Serial.println();
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

  serializeJson(docOut, Serial);
  Serial.println();
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
  serializeJson(docOut, Serial);
  Serial.println();
}

void sendResponse(const char* status, const char* message) {
  docOut.clear();
  docOut["status"] = status;
  docOut["message"] = message;
  serializeJson(docOut, Serial);
  Serial.println();
}

void sendError(const char* message) {
  sendResponse("error", message);
}
