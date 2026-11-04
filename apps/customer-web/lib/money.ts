/** Display only. All amounts arrive from the API in integer cents. */
export const usd = (cents: number) => `${cents < 0 ? '−' : ''}$${(Math.abs(cents) / 100).toFixed(2)}`;
export const miles = (meters: number) => `${(meters / 1609.344).toFixed(1)} mi`;
