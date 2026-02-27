/*
 * Serial Bridge Test for Arduino UNO Q
 * Tests Serial1 (lpuart1) which connects to the MPU bridge
 */

#include <ArduinoGraphics.h>
#include <Arduino_LED_Matrix.h>

ArduinoLEDMatrix matrix;
uint8_t frame[104];

void setup() {
  // Initialize LED Matrix for visual feedback
  matrix.begin();
  memset(frame, 1, sizeof(frame));
  matrix.draw(frame);

  // Initialize both serial ports
  Serial.begin(115200);   // USART1 - D0/D1 pins
  Serial1.begin(115200);  // LPUART1 - Bridge to MPU

  delay(1000);

  // Send startup message on both
  Serial.println("{\"port\":\"Serial\",\"status\":\"ready\"}");
  Serial1.println("{\"port\":\"Serial1\",\"status\":\"ready\"}");

  // Visual confirmation - sweep
  for (int col = 0; col < 13; col++) {
    memset(frame, 0, sizeof(frame));
    for (int row = 0; row < 8; row++) {
      frame[row * 13 + col] = 1;
    }
    matrix.draw(frame);
    delay(50);
  }

  // Show checkmark
  memset(frame, 0, sizeof(frame));
  frame[5 * 13 + 2] = 1;
  frame[6 * 13 + 3] = 1;
  frame[7 * 13 + 4] = 1;
  frame[6 * 13 + 5] = 1;
  frame[5 * 13 + 6] = 1;
  frame[4 * 13 + 7] = 1;
  frame[3 * 13 + 8] = 1;
  frame[2 * 13 + 9] = 1;
  matrix.draw(frame);
}

void loop() {
  static unsigned long lastPrint = 0;
  static int counter = 0;

  // Print every 2 seconds on both ports
  if (millis() - lastPrint >= 2000) {
    lastPrint = millis();
    counter++;

    String msg = "{\"count\":" + String(counter) + "}";
    Serial.println(msg);
    Serial1.println(msg);
  }

  // Echo from Serial to Serial1 and vice versa
  while (Serial.available()) {
    char c = Serial.read();
    Serial1.write(c);
    Serial.print("S:");
    Serial.println(c);
  }

  while (Serial1.available()) {
    char c = Serial1.read();
    Serial.write(c);
    Serial1.print("S1:");
    Serial1.println(c);
  }
}
