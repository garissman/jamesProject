/*
 * Bridge Communication Test for Arduino UNO Q
 * Uses Arduino_RouterBridge for proper MPU communication
 */

#include <Arduino_RouterBridge.h>
#include <ArduinoGraphics.h>
#include <Arduino_LED_Matrix.h>

ArduinoLEDMatrix matrix;
uint8_t frame[104];

// RPC callback functions
bool set_led(bool state) {
    digitalWrite(LED_BUILTIN, state);
    return state;
}

String ping() {
    return String("pong");
}

int add(int a, int b) {
    return a + b;
}

void setup() {
    // Initialize LED Matrix for visual feedback
    matrix.begin();
    memset(frame, 1, sizeof(frame));
    matrix.draw(frame);

    // Initialize Bridge and Monitor
    if (!Bridge.begin()) {
        // Show error pattern on matrix
        memset(frame, 0, sizeof(frame));
        for (int i = 0; i < 8; i++) {
            frame[i * 13 + i] = 1;
            frame[i * 13 + (12 - i)] = 1;
        }
        matrix.draw(frame);
        while(1); // Halt
    }

    if (!Monitor.begin()) {
        // Show different error pattern
        memset(frame, 0, sizeof(frame));
        for (int i = 0; i < 13; i++) {
            frame[3 * 13 + i] = 1;
            frame[4 * 13 + i] = 1;
        }
        matrix.draw(frame);
        while(1); // Halt
    }

    pinMode(LED_BUILTIN, OUTPUT);

    // Register RPC methods
    Bridge.provide("set_led", set_led);
    Bridge.provide("ping", ping);
    Bridge.provide("add", add);

    // Startup animation
    for (int col = 0; col < 13; col++) {
        memset(frame, 0, sizeof(frame));
        for (int row = 0; row < 8; row++) {
            frame[row * 13 + col] = 1;
        }
        matrix.draw(frame);
        delay(50);
    }

    // Show checkmark for success
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

    Monitor.println("{\"status\":\"ready\",\"message\":\"Bridge test initialized\"}");
}

void loop() {
    static unsigned long lastPrint = 0;
    static int counter = 0;

    // Print status every 2 seconds
    if (millis() - lastPrint >= 2000) {
        lastPrint = millis();
        counter++;

        Monitor.print("{\"count\":");
        Monitor.print(counter);
        Monitor.println("}");
    }

    // Check for monitor input
    if (Monitor.available()) {
        String input = Monitor.readStringUntil('\n');
        input.trim();

        Monitor.print("{\"received\":\"");
        Monitor.print(input);
        Monitor.println("\"}");

        // Simple command parsing
        if (input == "ping") {
            Monitor.println("{\"status\":\"pong\"}");
        } else if (input == "blink") {
            for (int i = 0; i < 5; i++) {
                digitalWrite(LED_BUILTIN, HIGH);
                delay(100);
                digitalWrite(LED_BUILTIN, LOW);
                delay(100);
            }
            Monitor.println("{\"status\":\"ok\",\"message\":\"Blink done\"}");
        } else if (input == "matrix") {
            // Matrix sweep
            for (int col = 0; col < 13; col++) {
                memset(frame, 0, sizeof(frame));
                for (int row = 0; row < 8; row++) {
                    frame[row * 13 + col] = 1;
                }
                matrix.draw(frame);
                delay(50);
            }
            memset(frame, 0, sizeof(frame));
            matrix.draw(frame);
            Monitor.println("{\"status\":\"ok\",\"message\":\"Matrix sweep done\"}");
        }
    }

    delay(10);
}
