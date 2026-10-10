/** Change only these two values to return to the 3+3 minute format. */
export const AUDITION_TIMING = { behavioralSeconds: 60, technicalSeconds: 60 } as const;
export const AUDITION_SECONDS = AUDITION_TIMING.behavioralSeconds + AUDITION_TIMING.technicalSeconds;
export const AUDITION_MS = AUDITION_SECONDS * 1000;
export const TECHNICAL_START_MS = AUDITION_TIMING.behavioralSeconds * 1000;
export const WRAP_UP_MS = AUDITION_MS - Math.min(30, AUDITION_TIMING.technicalSeconds / 4) * 1000;
export const DURATION_LABEL = `${AUDITION_SECONDS / 60}-minute`;
export const DEMO_STARTER = `def top_k_frequent(nums, k):
    counts = {}
    for n in nums:
        counts[n] = counts.get(n, 0) + 1
    return sorted(counts, key=counts.get)[:k]`;
