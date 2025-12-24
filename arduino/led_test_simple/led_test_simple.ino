/*
 * Simple LED Test for Arduino UNO Q
 * Tests RGB LEDs and built-in LED without the matrix library
 */

#include <ArduinoJson.h>

// RGB LED pins (from variant.h)
// LED3_R, LED3_G, LED3_B, LED4_R, LED4_G, LED4_B should be defined

#define RGB_ON LOW   // Active-low
#define RGB_OFF HIGH

StaticJsonDocument<256> docIn;
StaticJsonDocument<256> docOut;
String inputBuffer = "";

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("{\"status\":\"debug\",\"message\":\"Starting simple LED test...\"}");

  // Initialize built-in LED
  pinMode(LED_BUILTIN, OUTPUT);
  digitalWrite(LED_BUILTIN, LOW);

  Serial.println("{\"status\":\"debug\",\"message\":\"Built-in LED initialized\"}");

  // Try to initialize RGB LEDs
  #ifdef LED3_R
    Serial.println("{\"status\":\"debug\",\"message\":\"Initializing RGB LED3...\"}");
    pinMode(LED3_R, OUTPUT);
    pinMode(LED3_G, OUTPUT);
    pinMode(LED3_B, OUTPUT);
    digitalWrite(LED3_R, RGB_OFF);
    digitalWrite(LED3_G, RGB_OFF);
    digitalWrite(LED3_B, RGB_OFF);
    Serial.println("{\"status\":\"debug\",\"message\":\"RGB LED3 initialized\"}");
  #else
    Serial.println("{\"status\":\"debug\",\"message\":\"LED3_R not defined\"}");
  #endif

  #ifdef LED4_R
    Serial.println("{\"status\":\"debug\",\"message\":\"Initializing RGB LED4...\"}");
    pinMode(LED4_R, OUTPUT);
    pinMode(LED4_G, OUTPUT);
    pinMode(LED4_B, OUTPUT);
    digitalWrite(LED4_R, RGB_OFF);
    digitalWrite(LED4_G, RGB_OFF);
    digitalWrite(LED4_B, RGB_OFF);
    Serial.println("{\"status\":\"debug\",\"message\":\"RGB LED4 initialized\"}");
  #else
    Serial.println("{\"status\":\"debug\",\"message\":\"LED4_R not defined\"}");
  #endif

  // Startup blink on built-in LED
  for (int i = 0; i < 5; i++) {
    digitalWrite(LED_BUILTIN, HIGH);
    delay(100);
    digitalWrite(LED_BUILTIN, LOW);
    delay(100);
  }

  Serial.println("{\"status\":\"ready\",\"message\":\"Simple LED test ready\"}");
}

void loop() {
  // Blink built-in LED slowly to show we're running
  static unsigned long lastBlink = 0;
  static bool ledState = false;

  if (millis() - lastBlink > 1000) {
    lastBlink = millis();
    ledState = !ledState;
    digitalWrite(LED_BUILTIN, ledState ? HIGH : LOW);
  }

  // Check for serial commands
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n') {
      processCommand(inputBuffer);
      inputBuffer = "";
    } else {
      inputBuffer += c;
    }
  }
}

void processCommand(String& input) {
  DeserializationError error = deserializeJson(docIn, input);

  if (error) {
    Serial.println("{\"status\":\"error\",\"message\":\"JSON parse error\"}");
    return;
  }

  const char* cmd = docIn["cmd"];
  if (!cmd) {
    Serial.println("{\"status\":\"error\",\"message\":\"Missing command\"}");
    return;
  }

  if (strcmp(cmd, "ping") == 0) {
    Serial.println("{\"status\":\"pong\",\"message\":\"OK\"}");
  }
  else if (strcmp(cmd, "blink") == 0) {
    // Blink built-in LED
    for (int i = 0; i < 5; i++) {
      digitalWrite(LED_BUILTIN, HIGH);
      delay(200);
      digitalWrite(LED_BUILTIN, LOW);
      delay(200);
    }
    Serial.println("{\"status\":\"ok\",\"message\":\"Blink done\"}");
  }
  else if (strcmp(cmd, "rgb") == 0) {
    // Test RGB LEDs
    #ifdef LED3_R
      // Red
      digitalWrite(LED3_R, RGB_ON);
      digitalWrite(LED3_G, RGB_OFF);
      digitalWrite(LED3_B, RGB_OFF);
      delay(500);
      // Green
      digitalWrite(LED3_R, RGB_OFF);
      digitalWrite(LED3_G, RGB_ON);
      digitalWrite(LED3_B, RGB_OFF);
      delay(500);
      // Blue
      digitalWrite(LED3_R, RGB_OFF);
      digitalWrite(LED3_G, RGB_OFF);
      digitalWrite(LED3_B, RGB_ON);
      delay(500);
      // Off
      digitalWrite(LED3_R, RGB_OFF);
      digitalWrite(LED3_G, RGB_OFF);
      digitalWrite(LED3_B, RGB_OFF);
      Serial.println("{\"status\":\"ok\",\"message\":\"RGB test done\"}");
    #else
      Serial.println("{\"status\":\"error\",\"message\":\"RGB LEDs not available\"}");
    #endif
  }
  else if (strcmp(cmd, "red") == 0) {
    #ifdef LED3_R
      digitalWrite(LED3_R, RGB_ON);
      digitalWrite(LED3_G, RGB_OFF);
      digitalWrite(LED3_B, RGB_OFF);
    #endif
    #ifdef LED4_R
      digitalWrite(LED4_R, RGB_ON);
      digitalWrite(LED4_G, RGB_OFF);
      digitalWrite(LED4_B, RGB_OFF);
    #endif
    Serial.println("{\"status\":\"ok\",\"message\":\"Red on\"}");
  }
  else if (strcmp(cmd, "green") == 0) {
    #ifdef LED3_R
      digitalWrite(LED3_R, RGB_OFF);
      digitalWrite(LED3_G, RGB_ON);
      digitalWrite(LED3_B, RGB_OFF);
    #endif
    #ifdef LED4_R
      digitalWrite(LED4_R, RGB_OFF);
      digitalWrite(LED4_G, RGB_ON);
      digitalWrite(LED4_B, RGB_OFF);
    #endif
    Serial.println("{\"status\":\"ok\",\"message\":\"Green on\"}");
  }
  else if (strcmp(cmd, "blue") == 0) {
    #ifdef LED3_R
      digitalWrite(LED3_R, RGB_OFF);
      digitalWrite(LED3_G, RGB_OFF);
      digitalWrite(LED3_B, RGB_ON);
    #endif
    #ifdef LED4_R
      digitalWrite(LED4_R, RGB_OFF);
      digitalWrite(LED4_G, RGB_OFF);
      digitalWrite(LED4_B, RGB_ON);
    #endif
    Serial.println("{\"status\":\"ok\",\"message\":\"Blue on\"}");
  }
  else if (strcmp(cmd, "off") == 0) {
    #ifdef LED3_R
      digitalWrite(LED3_R, RGB_OFF);
      digitalWrite(LED3_G, RGB_OFF);
      digitalWrite(LED3_B, RGB_OFF);
    #endif
    #ifdef LED4_R
      digitalWrite(LED4_R, RGB_OFF);
      digitalWrite(LED4_G, RGB_OFF);
      digitalWrite(LED4_B, RGB_OFF);
    #endif
    Serial.println("{\"status\":\"ok\",\"message\":\"LEDs off\"}");
  }
  else {
    Serial.println("{\"status\":\"error\",\"message\":\"Unknown command\"}");
  }
}
