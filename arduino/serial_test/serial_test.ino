/*
 * Simple Serial Test for Arduino UNO Q
 * Continuously prints to serial to test communication
 */

void setup() {
  Serial.begin(115200);
  delay(1000);

  pinMode(LED_BUILTIN, OUTPUT);

  // Print startup message
  Serial.println("Serial Test Started!");
  Serial.println("{\"status\":\"ready\"}");
}

void loop() {
  static unsigned long lastPrint = 0;
  static int counter = 0;

  // Blink LED to show we're running
  digitalWrite(LED_BUILTIN, (millis() / 500) % 2);

  // Print every second
  if (millis() - lastPrint >= 1000) {
    lastPrint = millis();
    counter++;

    Serial.print("Counter: ");
    Serial.println(counter);

    Serial.print("{\"count\":");
    Serial.print(counter);
    Serial.println("}");
  }

  // Echo any received data
  while (Serial.available()) {
    char c = Serial.read();
    Serial.print("Echo: ");
    Serial.println(c);
  }
}
