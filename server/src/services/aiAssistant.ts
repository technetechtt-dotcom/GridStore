export function buildAiAnswer(prompt: string): string {
  if (!prompt.trim()) {
    return 'Tell me what you need, your budget, and your location and I will suggest a bundle.';
  }

  const lowerPrompt = prompt.toLowerCase();

  if (lowerPrompt.includes('solar') || lowerPrompt.includes('inverter')) {
    return 'For solar in South Africa, compare inverter size, battery cycle life, and certified installers in your area. I found strong matches in PowerSmart Energy.';
  }

  if (lowerPrompt.includes('plumber') || lowerPrompt.includes('electrician')) {
    return 'For urgent services, prioritize verified providers with 4.7+ ratings and response time under 30 minutes. I can shortlist 3 options near you.';
  }

  if (lowerPrompt.includes('podcast') || lowerPrompt.includes('mic')) {
    return 'Starter podcast setup: dynamic mic + closed-back headphones + basic audio interface. I can build a cart under your budget from top-rated listings.';
  }

  return 'I found relevant products, services, and rentals. Use marketplace filters for price, location, and trust score to narrow to best-fit options.';
}
