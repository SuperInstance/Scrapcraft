/**
 * Shared motion constants. The compiler (for macro-expanding "turn 90°" into a
 * timed turn) and the VirtualRobot (for simulating motion) MUST agree on these,
 * so they live in one place imported by both. No circular dependency.
 */
export const DRIVE_SPEED = 3.0;   // blocks / second at speed = 1.0
export const TURN_RATE   = 180;   // degrees / second at speed = 1.0
export const BOT_RADIUS  = 0.3;   // for wall collision in the sim
export const SONAR_RANGE = 6.0;   // blocks; distance_ahead normalizes against this
