// Whether Hammy is still with us. Its own file, and typed by the one field it
// reads, so the arcade can ask it without the rest of the game coming along.

export const isAlive = (s: { diedAt: number | null }): boolean => s.diedAt === null;
