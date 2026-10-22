/**
 * GSAP setup for editorial (marketing) motion only. Import from here so plugins register once,
 * and only from lazily loaded public pages — admin and booking screens never pull GSAP in.
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(ScrollTrigger, SplitText, useGSAP);

/** Run motion only for users who have not asked to reduce it. */
export const MOTION_OK = '(prefers-reduced-motion: no-preference)';
/** Parallax/scrub only on large pointer screens. */
export const DESKTOP_MOTION_OK = '(prefers-reduced-motion: no-preference) and (min-width: 1024px)';

export const EDITORIAL_EASE = 'power3.out';
/** Long, soft settle used for masked text and image reveals. */
export const REVEAL_EASE = 'expo.out';

export { gsap, ScrollTrigger, SplitText, useGSAP };
