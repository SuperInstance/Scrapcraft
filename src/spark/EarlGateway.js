/**
 * EarlGateway — routes Big Earl's dialogue through the configured provider.
 *
 * When online, Earl uses the player's chosen AI provider for dynamic dialogue.
 * When offline, Earl uses the preset quip banks.
 */
import { sparkGateway } from './SparkGateway.js';

export async function getEarlResponse(context, playerState, offlineQuips) {
  // Try AI first
  const systemPrompt = `You are Big Earl, the gruff foreman of a scrapyard called SCRAPCRAFT.
Keep replies SHORT (1-3 sentences). Be witty, punchy, and occasionally self-deprecating.
You call the player "kid" or "rookie". Never break character. Never mention AI.
Current context: ${context}`;

  const aiResponse = await sparkGateway.ask(systemPrompt, playerState, {
    temperature: 0.8,
    maxTokens: 150,
  });

  if (aiResponse) return aiResponse;

  // Fall back to offline quips
  const quips = offlineQuips;
  return quips[Math.floor(Math.random() * quips.length)];
}
