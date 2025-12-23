/*
 * Stepper Motor Controller for Arduino UNO Q (STM32U585 MCU)
 * Laboratory Sampler - 4 Stepper Motor Control with Limit Switches
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
  // Initialize serial communication
  Serial.begin(115200);
  while (!Serial) {
    ; // Wait for serial port to connect
  }

  // Initialize all motor pins
  for (int i = 0; i < NUM_MOTORS; i++) {
    initMotor(i);
  }

  // Send ready message
  sendResponse("ready", "Stepper controller initialized");
}

void loop() {
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
    sendError("JSON parse error");
    return;
  }

  const char* cmd = docIn["cmd"];
  if (!cmd) {
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
  else if (strcmp(cmd, "ping") == 0) {
    sendResponse("pong", "OK");
  }
  else {
    sendError("Unknown command");
  }
}

void cmdInitMotor() {
  int motorId = docIn["motor_id"] | -1;
  int pulsePin = docIn["pulse_pin"] | -1;
  int dirPin = docIn["dir_pin"] | -1;
  int limitPin = docIn["limit_pin"] | -1;

  if (motorId < 1 || motorId > NUM_MOTORS) {
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

  sendResponse("ok", "Motor initialized");
}

void cmdStep() {
  int motorId = docIn["motor_id"] | -1;
  int direction = docIn["direction"] | 0;
  int steps = docIn["steps"] | 0;
  long delayUs = docIn["delay_us"] | 1000;
  bool respectLimit = docIn["respect_limit"] | true;

  if (motorId < 1 || motorId > NUM_MOTORS) {
    sendError("Invalid motor_id");
    return;
  }

  int idx = motorId - 1;

  if (!motors[idx].initialized) {
    sendError("Motor not initialized");
    return;
  }

  // Execute steps
  int stepsExecuted = executeSteps(idx, direction, steps, delayUs, respectLimit);

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
  }

  return stepsExecuted;
}

void cmdStop() {
  int motorId = docIn["motor_id"] | -1;

  if (motorId < 1 || motorId > NUM_MOTORS) {
    sendError("Invalid motor_id");
    return;
  }

  int idx = motorId - 1;

  // Set pins low
  digitalWrite(motors[idx].pulsePin, LOW);
  digitalWrite(motors[idx].dirPin, LOW);

  sendResponse("ok", "Motor stopped");
}

void cmdStopAll() {
  for (int i = 0; i < NUM_MOTORS; i++) {
    if (motors[i].initialized) {
      digitalWrite(motors[i].pulsePin, LOW);
      digitalWrite(motors[i].dirPin, LOW);
    }
  }
  sendResponse("ok", "All motors stopped");
}

void cmdHomeMotor() {
  int motorId = docIn["motor_id"] | -1;
  int direction = docIn["direction"] | 0;  // Direction to move toward home
  long delayUs = docIn["delay_us"] | 2000;  // Slower speed for homing
  int maxSteps = docIn["max_steps"] | 10000;  // Safety limit

  if (motorId < 1 || motorId > NUM_MOTORS) {
    sendError("Invalid motor_id");
    return;
  }

  int idx = motorId - 1;

  if (!motors[idx].initialized) {
    sendError("Motor not initialized");
    return;
  }

  // Set direction toward home
  digitalWrite(motors[idx].dirPin, direction ? HIGH : LOW);
  delayMicroseconds(5);

  int stepsExecuted = 0;

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

  // Home each motor sequentially
  for (int i = 0; i < NUM_MOTORS; i++) {
    if (!motors[i].initialized) continue;

    // Set direction
    digitalWrite(motors[i].dirPin, direction ? HIGH : LOW);
    delayMicroseconds(5);

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
    }
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
    sendError("Missing movements array");
    return;
  }

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
  }

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
