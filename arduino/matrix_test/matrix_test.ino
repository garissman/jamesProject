/*
 * Minimal LED Matrix Test for Arduino UNO Q
 * This sketch tests the LED matrix without serial commands
 */

#include <ArduinoGraphics.h>
#include <Arduino_LED_Matrix.h>

ArduinoLEDMatrix matrix;

// Frame buffer - 104 elements (8 rows x 13 cols)
uint8_t frame[104];

void setup() {
  // Initialize matrix
  matrix.begin();

  // Clear frame
  memset(frame, 0, sizeof(frame));

  // Test 1: Fill entire matrix
  memset(frame, 1, sizeof(frame));
  matrix.draw(frame);
  delay(1000);

  // Test 2: Column sweep
  for (int col = 0; col < 13; col++) {
    memset(frame, 0, sizeof(frame));
    for (int row = 0; row < 8; row++) {
      frame[row * 13 + col] = 1;
    }
    matrix.draw(frame);
    delay(100);
  }

  // Test 3: Row sweep
  for (int row = 0; row < 8; row++) {
    memset(frame, 0, sizeof(frame));
    for (int col = 0; col < 13; col++) {
      frame[row * 13 + col] = 1;
    }
    matrix.draw(frame);
    delay(150);
  }

  // Test 4: Checkerboard
  for (int i = 0; i < 104; i++) {
    int row = i / 13;
    int col = i % 13;
    frame[i] = ((row + col) % 2) ? 1 : 0;
  }
  matrix.draw(frame);
  delay(1000);

  // Test 5: Inverse checkerboard
  for (int i = 0; i < 104; i++) {
    int row = i / 13;
    int col = i % 13;
    frame[i] = ((row + col) % 2) ? 0 : 1;
  }
  matrix.draw(frame);
  delay(1000);
}

void loop() {
  // Breathing animation - expanding/contracting from center
  static int phase = 0;

  memset(frame, 0, sizeof(frame));

  int centerRow = 4;
  int centerCol = 6;
  int radius = phase % 7;

  for (int dr = -radius; dr <= radius; dr++) {
    for (int dc = -radius; dc <= radius; dc++) {
      int r = centerRow + dr;
      int c = centerCol + dc;
      if (r >= 0 && r < 8 && c >= 0 && c < 13) {
        // Diamond shape
        if (abs(dr) + abs(dc) <= radius) {
          frame[r * 13 + c] = 1;
        }
      }
    }
  }

  matrix.draw(frame);
  phase++;
  delay(200);
}
